// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAegisIdentityRegistry.sol";
import "./interfaces/IAegisValidationRegistry.sol";

/**
 * @title AegisHiringEscrow
 * @dev Production-minded native MON escrow contract for the AegisAgent hiring lifecycle.
 * Cryptographically binds jobs to ERC-8004 agent identities, designated validators,
 * and deliverable submission hashes on Monad Testnet.
 */
contract AegisHiringEscrow is ReentrancyGuard {
    // --- Constants ---
    uint256 public constant MAX_VALIDATOR_FEE_BPS = 5000; // 50% max fee
    uint64 public constant CHALLENGE_WINDOW = 24 hours;   // 24-hour challenge window after validation failure
    uint64 public constant DISPUTE_TIMEOUT = 7 days;      // 7-day arbiter inactivity timeout

    // --- State Machine ---
    enum JobStatus {
        UNINITIALIZED,       // 0 - Uninitialized
        CREATED,             // 1 - Proposal created, escrow locked
        ACCEPTED,            // 2 - Provider accepted, awaiting submission
        SUBMITTED,           // 3 - Deliverable submitted, ready for validation
        VALIDATING,          // 4 - Validation registered / active
        COMPLETED,           // 5 - Passing validation verified, settled to provider
        REJECTED,            // 6 - Rejected by provider, refunded to client
        CANCELLED,           // 7 - Cancelled by client, refunded to client
        EXPIRED,             // 8 - Acceptance deadline passed, refunded to client
        EXPIRED_UNSUBMITTED, // 9 - Submission deadline passed, refunded to client
        FAILED_VALIDATION,   // 10 - Failing validation recorded, 24h challenge window
        DISPUTED,            // 11 - Disputed, funds frozen for arbiter
        REFUNDED             // 12 - Refunded to client (failed validation, arbiter client win, dispute timeout)
    }

    enum Ruling {
        CLIENT_WINS,         // 0 - 100% refund to client
        PROVIDER_WINS,       // 1 - Provider payout (minus fee), validator fee paid
        SPLIT                // 2 - 50/50 split, validator fee waived
    }

    struct Job {
        bytes32 jobId;
        uint256 clientAgentId;
        address client;
        uint256 providerAgentId;
        address validatorAddress;
        uint256 rewardAmount;
        uint256 validatorFeeBps;       // 0 - 5000 basis points
        uint8 minAcceptanceScore;      // 1 - 100
        uint64 acceptanceDeadline;
        uint64 submissionDeadline;
        uint64 validationDeadline;
        bytes32 taskHash;
        bytes32 prehireTrustSnapshotHash;
        JobStatus status;
        bool settled;                  // Prevents double-settlement or double-refund
        bytes32 submissionHash;
        string submissionURI;
        uint64 submissionTimestamp;
        bytes32 validationRequestHash;
        uint64 failureTimestamp;
        uint64 challengeDeadline;
        uint64 disputeTimestamp;
        address designatedArbiter;
    }

    // --- Storage ---
    IAegisIdentityRegistry public immutable identityRegistry;
    IAegisValidationRegistry public immutable validationRegistry;
    address public immutable defaultArbiter;

    mapping(bytes32 => Job) private _jobs;
    mapping(address => uint256) public pendingValidatorFees;
    uint256 public totalPendingValidatorFees;

    // --- Events ---
    event JobCreated(
        bytes32 indexed jobId,
        uint256 indexed clientAgentId,
        uint256 indexed providerAgentId,
        address client,
        address validatorAddress,
        uint256 rewardAmount,
        uint256 validatorFeeBps,
        uint8 minAcceptanceScore,
        uint64 acceptanceDeadline,
        uint64 submissionDeadline,
        uint64 validationDeadline,
        bytes32 taskHash,
        bytes32 prehireTrustSnapshotHash,
        address designatedArbiter
    );

    event JobAccepted(bytes32 indexed jobId, uint256 indexed providerAgentId, address indexed providerWallet);
    event JobRejected(bytes32 indexed jobId, uint256 indexed providerAgentId, string reason);
    event JobCancelled(bytes32 indexed jobId, address indexed client);
    event JobExpired(bytes32 indexed jobId);
    event JobSubmitted(
        bytes32 indexed jobId,
        uint256 indexed providerAgentId,
        bytes32 submissionHash,
        string submissionURI,
        bytes32 indexed validationRequestHash
    );
    event JobExpiredUnsubmitted(bytes32 indexed jobId);
    event JobValidating(bytes32 indexed jobId, bytes32 indexed validationRequestHash);
    event JobCompleted(
        bytes32 indexed jobId,
        uint256 indexed providerAgentId,
        address providerWallet,
        uint256 providerPayout,
        address validatorAddress,
        uint256 validatorFee
    );
    event ValidationFailed(
        bytes32 indexed jobId,
        uint8 responseScore,
        uint64 challengeDeadline
    );
    event JobRefunded(bytes32 indexed jobId, address indexed recipient, uint256 amount);
    event JobDisputed(bytes32 indexed jobId, address indexed disputer, string justificationURI);
    event DisputeResolved(
        bytes32 indexed jobId,
        Ruling ruling,
        address primaryRecipient,
        uint256 primaryAmount,
        address secondaryRecipient,
        uint256 secondaryAmount,
        string rulingURI
    );
    event DisputeTimedOut(bytes32 indexed jobId, address indexed client, uint256 refundAmount);
    event ValidatorFeeAccrued(bytes32 indexed jobId, address indexed validatorAddress, uint256 amount);
    event ValidatorFeeWithdrawn(address indexed validatorAddress, address indexed recipient, uint256 amount);

    /**
     * @notice Constructor initializes registry addresses and default arbiter.
     * @param identityRegistry_ Address of deployed AegisIdentityRegistry.
     * @param validationRegistry_ Address of deployed AegisValidationRegistry.
     * @param defaultArbiter_ Default designated arbiter address for disputes.
     */
    constructor(
        address identityRegistry_,
        address validationRegistry_,
        address defaultArbiter_
    ) {
        require(identityRegistry_ != address(0), "Zero identity registry address");
        require(validationRegistry_ != address(0), "Zero validation registry address");
        require(defaultArbiter_ != address(0), "Zero default arbiter address");

        identityRegistry = IAegisIdentityRegistry(identityRegistry_);
        validationRegistry = IAegisValidationRegistry(validationRegistry_);
        defaultArbiter = defaultArbiter_;
    }

    /**
     * @notice Computes the canonical validation request hash bound to job terms and deliverable.
     * @param jobId The job identifier.
     * @param providerAgentId The provider agent ID.
     * @param validatorAddress The designated validator.
     * @param submissionHash The hash of the uncompressed deliverable.
     * @return Canonical request hash registered on AegisValidationRegistry.
     */
    function deriveValidationRequestHash(
        bytes32 jobId,
        uint256 providerAgentId,
        address validatorAddress,
        bytes32 submissionHash
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(jobId, providerAgentId, validatorAddress, submissionHash));
    }

    /**
     * @notice Creates a new job with escrowed native MON reward.
     * @param jobId Unique identifier for the job agreement.
     * @param clientAgentId The agent ID of the hiring client.
     * @param providerAgentId The agent ID of the provider agent.
     * @param validatorAddress Designated validator address.
     * @param validatorFeeBps Validator fee in basis points (0 - 5000).
     * @param minAcceptanceScore Minimum score required for automatic completion (1 - 100).
     * @param acceptanceDeadline Timestamp by which provider must accept.
     * @param submissionDeadline Timestamp by which provider must submit work.
     * @param validationDeadline Timestamp by which validation must be completed.
     * @param taskHash Hash representing task description and criteria.
     * @param prehireTrustSnapshotHash Hash of the deterministic trust evaluation.
     * @param arbiterOverride Optional arbiter override (address(0) defaults to defaultArbiter).
     */
    function createJob(
        bytes32 jobId,
        uint256 clientAgentId,
        uint256 providerAgentId,
        address validatorAddress,
        uint256 validatorFeeBps,
        uint8 minAcceptanceScore,
        uint64 acceptanceDeadline,
        uint64 submissionDeadline,
        uint64 validationDeadline,
        bytes32 taskHash,
        bytes32 prehireTrustSnapshotHash,
        address arbiterOverride
    ) external payable nonReentrant returns (bytes32) {
        require(jobId != bytes32(0), "Empty job ID");
        require(_jobs[jobId].status == JobStatus.UNINITIALIZED, "Job ID already exists");
        require(msg.value > 0, "Reward amount must be positive");
        require(clientAgentId != 0 && providerAgentId != 0, "Agent ID cannot be zero");
        require(clientAgentId != providerAgentId, "Client cannot hire self");
        require(validatorAddress != address(0), "Validator cannot be zero address");
        require(validatorAddress != msg.sender, "Validator cannot be client");
        require(validatorFeeBps <= MAX_VALIDATOR_FEE_BPS, "Validator fee exceeds 50%");
        require(minAcceptanceScore > 0 && minAcceptanceScore <= 100, "Invalid min acceptance score");

        // Client authorization: caller must be owner or operational wallet of clientAgentId
        address clientOwner = identityRegistry.ownerOf(clientAgentId);
        address clientWallet = identityRegistry.getAgentWallet(clientAgentId);
        require(
            msg.sender == clientOwner || (clientWallet != address(0) && msg.sender == clientWallet),
            "Unauthorized client caller"
        );

        // Verify provider exists in Identity Registry
        identityRegistry.ownerOf(providerAgentId);

        // Strict sequential deadline ordering
        require(block.timestamp < acceptanceDeadline, "Acceptance deadline must be in future");
        require(acceptanceDeadline < submissionDeadline, "Submission deadline must follow acceptance");
        require(submissionDeadline < validationDeadline, "Validation deadline must follow submission");

        address arbiter = arbiterOverride == address(0) ? defaultArbiter : arbiterOverride;

        _jobs[jobId] = Job({
            jobId: jobId,
            clientAgentId: clientAgentId,
            client: msg.sender,
            providerAgentId: providerAgentId,
            validatorAddress: validatorAddress,
            rewardAmount: msg.value,
            validatorFeeBps: validatorFeeBps,
            minAcceptanceScore: minAcceptanceScore,
            acceptanceDeadline: acceptanceDeadline,
            submissionDeadline: submissionDeadline,
            validationDeadline: validationDeadline,
            taskHash: taskHash,
            prehireTrustSnapshotHash: prehireTrustSnapshotHash,
            status: JobStatus.CREATED,
            settled: false,
            submissionHash: bytes32(0),
            submissionURI: "",
            submissionTimestamp: 0,
            validationRequestHash: bytes32(0),
            failureTimestamp: 0,
            challengeDeadline: 0,
            disputeTimestamp: 0,
            designatedArbiter: arbiter
        });

        emit JobCreated(
            jobId,
            clientAgentId,
            providerAgentId,
            msg.sender,
            validatorAddress,
            msg.value,
            validatorFeeBps,
            minAcceptanceScore,
            acceptanceDeadline,
            submissionDeadline,
            validationDeadline,
            taskHash,
            prehireTrustSnapshotHash,
            arbiter
        );

        return jobId;
    }

    /**
     * @notice Provider accepts the job proposal before acceptanceDeadline.
     * @param jobId The job identifier.
     */
    function acceptJob(bytes32 jobId) external {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.CREATED, "Job not in CREATED status");
        require(block.timestamp <= job.acceptanceDeadline, "Acceptance deadline passed");

        address providerWallet = identityRegistry.getAgentWallet(job.providerAgentId);
        require(providerWallet != address(0), "Provider operational wallet unset");
        require(msg.sender == providerWallet, "Caller is not provider wallet");

        job.status = JobStatus.ACCEPTED;

        emit JobAccepted(jobId, job.providerAgentId, msg.sender);
    }

    /**
     * @notice Provider rejects the job proposal before acceptanceDeadline. Escrow is refunded to client.
     * @param jobId The job identifier.
     * @param reason Code or description explaining rejection.
     */
    function rejectJob(bytes32 jobId, string calldata reason) external nonReentrant {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.CREATED, "Job not in CREATED status");
        require(block.timestamp <= job.acceptanceDeadline, "Acceptance deadline passed");
        require(!job.settled, "Job already settled");

        address providerWallet = identityRegistry.getAgentWallet(job.providerAgentId);
        require(providerWallet != address(0), "Provider operational wallet unset");
        require(msg.sender == providerWallet, "Caller is not provider wallet");

        job.status = JobStatus.REJECTED;
        job.settled = true;

        uint256 refundAmount = job.rewardAmount;
        address client = job.client;

        emit JobRejected(jobId, job.providerAgentId, reason);
        emit JobRefunded(jobId, client, refundAmount);

        (bool success, ) = client.call{value: refundAmount}("");
        require(success, "Client refund transfer failed");
    }

    /**
     * @notice Client cancels the job proposal before it is accepted. Escrow is refunded.
     * @param jobId The job identifier.
     */
    function cancelJob(bytes32 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.CREATED, "Job not in CREATED status");
        require(msg.sender == job.client, "Caller is not client");
        require(!job.settled, "Job already settled");

        job.status = JobStatus.CANCELLED;
        job.settled = true;

        uint256 refundAmount = job.rewardAmount;
        address client = job.client;

        emit JobCancelled(jobId, client);
        emit JobRefunded(jobId, client, refundAmount);

        (bool success, ) = client.call{value: refundAmount}("");
        require(success, "Client refund transfer failed");
    }

    /**
     * @notice Refunds client if acceptance deadline passes without acceptance.
     * @param jobId The job identifier.
     */
    function expireJob(bytes32 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.CREATED, "Job not in CREATED status");
        require(block.timestamp > job.acceptanceDeadline, "Acceptance deadline not passed");
        require(!job.settled, "Job already settled");

        job.status = JobStatus.EXPIRED;
        job.settled = true;

        uint256 refundAmount = job.rewardAmount;
        address client = job.client;

        emit JobExpired(jobId);
        emit JobRefunded(jobId, client, refundAmount);

        (bool success, ) = client.call{value: refundAmount}("");
        require(success, "Client refund transfer failed");
    }

    /**
     * @notice Provider submits deliverable hash before submissionDeadline.
     * @param jobId The job identifier.
     * @param submissionHash Keccak256 hash of the deliverable payload.
     * @param submissionURI Location of the deliverable payload (IPFS/HTTPS).
     */
    function submitJob(
        bytes32 jobId,
        bytes32 submissionHash,
        string calldata submissionURI
    ) external {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.ACCEPTED, "Job not in ACCEPTED status");
        require(block.timestamp <= job.submissionDeadline, "Submission deadline passed");
        require(submissionHash != bytes32(0), "Empty submission hash");
        require(bytes(submissionURI).length > 0, "Empty submission URI");

        address providerWallet = identityRegistry.getAgentWallet(job.providerAgentId);
        require(providerWallet != address(0), "Provider operational wallet unset");
        require(msg.sender == providerWallet, "Caller is not provider wallet");

        bytes32 reqHash = deriveValidationRequestHash(
            jobId,
            job.providerAgentId,
            job.validatorAddress,
            submissionHash
        );

        job.submissionHash = submissionHash;
        job.submissionURI = submissionURI;
        job.submissionTimestamp = uint64(block.timestamp);
        job.validationRequestHash = reqHash;
        job.status = JobStatus.SUBMITTED;

        emit JobSubmitted(jobId, job.providerAgentId, submissionHash, submissionURI, reqHash);
    }

    /**
     * @notice Refunds client if submission deadline passes without deliverable submission.
     * @param jobId The job identifier.
     */
    function expireUnsubmittedJob(bytes32 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.ACCEPTED, "Job not in ACCEPTED status");
        require(block.timestamp > job.submissionDeadline, "Submission deadline not passed");
        require(!job.settled, "Job already settled");

        job.status = JobStatus.EXPIRED_UNSUBMITTED;
        job.settled = true;

        uint256 refundAmount = job.rewardAmount;
        address client = job.client;

        emit JobExpiredUnsubmitted(jobId);
        emit JobRefunded(jobId, client, refundAmount);

        (bool success, ) = client.call{value: refundAmount}("");
        require(success, "Client refund transfer failed");
    }

    /**
     * @notice Transitions a job from SUBMITTED to VALIDATING once the validation request is active on-chain.
     * @dev Queries the configured Validation Registry to verify that the request hash was registered.
     * @param jobId The job identifier.
     */
    function startValidation(bytes32 jobId) external {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.SUBMITTED, "Job not in SUBMITTED status");

        // Verify request exists on the Validation Registry
        (
            address actualValidator,
            uint256 actualAgentId,
            ,
            ,
            ,
            
        ) = validationRegistry.getValidationStatus(job.validationRequestHash);

        require(actualValidator == job.validatorAddress, "Validator mismatch on registry");
        require(actualAgentId == job.providerAgentId, "Agent ID mismatch on registry");

        job.status = JobStatus.VALIDATING;

        emit JobValidating(jobId, job.validationRequestHash);
    }

    /**
     * @notice Settles a completed job upon verifying passing validation response on Validation Registry.
     * @dev Enforces all 6 Gate 2 invariant checks: status, settled, requestHash, validator, agentId,
     * deadline, submission timing, and minimum score.
     * @param jobId The job identifier.
     */
    function settleCompletedJob(bytes32 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.VALIDATING, "Job not in VALIDATING status");
        require(!job.settled, "Job already settled");

        bytes32 expectedRequestHash = deriveValidationRequestHash(
            jobId,
            job.providerAgentId,
            job.validatorAddress,
            job.submissionHash
        );
        require(job.validationRequestHash == expectedRequestHash, "Request hash mismatch");

        // Read attestation from deployed Validation Registry
        (
            address actualValidator,
            uint256 actualAgentId,
            uint8 responseScore,
            ,
            ,
            uint256 lastUpdate
        ) = validationRegistry.getValidationStatus(expectedRequestHash);

        require(lastUpdate > 0, "No validation response recorded");
        require(actualValidator == job.validatorAddress, "Validator mismatch");
        require(actualAgentId == job.providerAgentId, "Agent ID mismatch");
        require(lastUpdate <= job.validationDeadline, "Validation response expired");
        require(lastUpdate >= job.submissionTimestamp, "Validation predates submission");
        require(responseScore >= job.minAcceptanceScore, "Validation score insufficient");

        // Effects
        job.status = JobStatus.COMPLETED;
        job.settled = true;

        address providerWallet = identityRegistry.getAgentWallet(job.providerAgentId);
        require(providerWallet != address(0), "Provider operational wallet unset");

        // Fee arithmetic: validatorFee = (rewardAmount * feeBps) / 10000; providerPayout = rewardAmount - fee;
        uint256 validatorFee = (job.rewardAmount * job.validatorFeeBps) / 10000;
        uint256 providerPayout = job.rewardAmount - validatorFee;

        // Pull-payment: record fee liability rather than pushing to validator
        if (validatorFee > 0) {
            pendingValidatorFees[job.validatorAddress] += validatorFee;
            totalPendingValidatorFees += validatorFee;
            emit ValidatorFeeAccrued(jobId, job.validatorAddress, validatorFee);
        }

        emit JobCompleted(
            jobId,
            job.providerAgentId,
            providerWallet,
            providerPayout,
            job.validatorAddress,
            validatorFee
        );

        // Interactions (CEI) - decoupled provider payout from validator receipt
        (bool pSuccess, ) = providerWallet.call{value: providerPayout}("");
        require(pSuccess, "Provider payout transfer failed");
    }

    /**
     * @notice Records validation failure when response score < minAcceptanceScore before validationDeadline.
     * Opens a 24-hour challenge window for the provider to dispute.
     * @param jobId The job identifier.
     */
    function recordValidationFailure(bytes32 jobId) external {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.VALIDATING, "Job not in VALIDATING status");
        require(!job.settled, "Job already settled");

        bytes32 expectedRequestHash = deriveValidationRequestHash(
            jobId,
            job.providerAgentId,
            job.validatorAddress,
            job.submissionHash
        );
        require(job.validationRequestHash == expectedRequestHash, "Request hash mismatch");

        (
            address actualValidator,
            uint256 actualAgentId,
            uint8 responseScore,
            ,
            ,
            uint256 lastUpdate
        ) = validationRegistry.getValidationStatus(expectedRequestHash);

        require(lastUpdate > 0, "No validation response recorded");
        require(actualValidator == job.validatorAddress, "Validator mismatch");
        require(actualAgentId == job.providerAgentId, "Agent ID mismatch");
        require(lastUpdate <= job.validationDeadline, "Validation response expired");
        require(lastUpdate >= job.submissionTimestamp, "Validation predates submission");
        require(responseScore < job.minAcceptanceScore, "Validation score passed");

        job.status = JobStatus.FAILED_VALIDATION;
        job.failureTimestamp = uint64(block.timestamp);
        job.challengeDeadline = uint64(block.timestamp + CHALLENGE_WINDOW);

        emit ValidationFailed(jobId, responseScore, job.challengeDeadline);
    }

    /**
     * @notice Client claims refund for failed validation after the 24-hour challenge window expires.
     * @param jobId The job identifier.
     */
    function claimFailedValidationRefund(bytes32 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.FAILED_VALIDATION, "Job not in FAILED_VALIDATION status");
        require(!job.settled, "Job already settled");
        require(block.timestamp > job.challengeDeadline, "Challenge window still active");

        job.status = JobStatus.REFUNDED;
        job.settled = true;

        uint256 refundAmount = job.rewardAmount;
        address client = job.client;

        emit JobRefunded(jobId, client, refundAmount);

        (bool success, ) = client.call{value: refundAmount}("");
        require(success, "Client refund transfer failed");
    }

    /**
     * @notice Raises a dispute from VALIDATING or FAILED_VALIDATION (within 24h challenge window).
     * @dev Permits provider to dispute unresponsive validators, overwritten responses, or bad evaluations.
     * Freezes funds until designated arbiter resolves or 7-day timeout passes.
     * @param jobId The job identifier.
     * @param justificationURI Metadata URI detailing the dispute justification.
     */
    function raiseDispute(bytes32 jobId, string calldata justificationURI) external nonReentrant {
        Job storage job = _jobs[jobId];
        require(!job.settled, "Job already settled");
        require(bytes(justificationURI).length > 0, "Justification URI empty");

        address providerWallet = identityRegistry.getAgentWallet(job.providerAgentId);
        require(msg.sender == job.client || (providerWallet != address(0) && msg.sender == providerWallet), "Unauthorized disputer");

        if (job.status == JobStatus.VALIDATING) {
            // Disputable from VALIDATING if validator is delinquent, overwritten, or contested
        } else if (job.status == JobStatus.FAILED_VALIDATION) {
            require(block.timestamp <= job.challengeDeadline, "Challenge window expired");
        } else {
            revert("Status does not permit dispute");
        }

        job.status = JobStatus.DISPUTED;
        job.disputeTimestamp = uint64(block.timestamp);

        emit JobDisputed(jobId, msg.sender, justificationURI);
    }

    /**
     * @notice Designated arbiter resolves an active dispute.
     * @param jobId The job identifier.
     * @param ruling Outcome (CLIENT_WINS, PROVIDER_WINS, SPLIT).
     * @param rulingURI Metadata URI explaining arbiter findings.
     */
    function resolveDispute(
        bytes32 jobId,
        Ruling ruling,
        string calldata rulingURI
    ) external nonReentrant {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.DISPUTED, "Job not in DISPUTED status");
        require(!job.settled, "Job already settled");
        require(msg.sender == job.designatedArbiter, "Caller is not designated arbiter");
        require(bytes(rulingURI).length > 0, "Ruling URI empty");

        job.settled = true;

        if (ruling == Ruling.CLIENT_WINS) {
            job.status = JobStatus.REFUNDED;
            uint256 refundAmount = job.rewardAmount;
            address client = job.client;

            emit DisputeResolved(jobId, Ruling.CLIENT_WINS, client, refundAmount, address(0), 0, rulingURI);
            emit JobRefunded(jobId, client, refundAmount);

            (bool success, ) = client.call{value: refundAmount}("");
            require(success, "Client dispute refund transfer failed");

        } else if (ruling == Ruling.PROVIDER_WINS) {
            address providerWallet = identityRegistry.getAgentWallet(job.providerAgentId);
            require(providerWallet != address(0), "Provider operational wallet unset");

            job.status = JobStatus.COMPLETED;
            uint256 validatorFee = (job.rewardAmount * job.validatorFeeBps) / 10000;
            uint256 providerPayout = job.rewardAmount - validatorFee;

            if (validatorFee > 0) {
                pendingValidatorFees[job.validatorAddress] += validatorFee;
                totalPendingValidatorFees += validatorFee;
                emit ValidatorFeeAccrued(jobId, job.validatorAddress, validatorFee);
            }

            emit DisputeResolved(
                jobId,
                Ruling.PROVIDER_WINS,
                providerWallet,
                providerPayout,
                job.validatorAddress,
                validatorFee,
                rulingURI
            );
            emit JobCompleted(
                jobId,
                job.providerAgentId,
                providerWallet,
                providerPayout,
                job.validatorAddress,
                validatorFee
            );

            (bool pSuccess, ) = providerWallet.call{value: providerPayout}("");
            require(pSuccess, "Provider payout transfer failed");

        } else if (ruling == Ruling.SPLIT) {
            address providerWallet = identityRegistry.getAgentWallet(job.providerAgentId);
            require(providerWallet != address(0), "Provider operational wallet unset");

            job.status = JobStatus.COMPLETED;
            address client = job.client;
            // 50/50 split with validator fee waived
            uint256 clientRefund = job.rewardAmount / 2;
            uint256 providerPayout = job.rewardAmount - clientRefund; // Handles odd wei dust

            emit DisputeResolved(
                jobId,
                Ruling.SPLIT,
                client,
                clientRefund,
                providerWallet,
                providerPayout,
                rulingURI
            );

            (bool cSuccess, ) = client.call{value: clientRefund}("");
            require(cSuccess, "Client split refund transfer failed");

            (bool pSuccess, ) = providerWallet.call{value: providerPayout}("");
            require(pSuccess, "Provider split payout transfer failed");
        }
    }

    /**
     * @notice Refunds client if designated arbiter fails to rule within DISPUTE_TIMEOUT (7 days).
     * @param jobId The job identifier.
     */
    function timeoutDispute(bytes32 jobId) external nonReentrant {
        Job storage job = _jobs[jobId];
        require(job.status == JobStatus.DISPUTED, "Job not in DISPUTED status");
        require(!job.settled, "Job already settled");
        require(block.timestamp > job.disputeTimestamp + DISPUTE_TIMEOUT, "Dispute timeout not reached");

        job.status = JobStatus.REFUNDED;
        job.settled = true;

        uint256 refundAmount = job.rewardAmount;
        address client = job.client;

        emit DisputeTimedOut(jobId, client, refundAmount);
        emit JobRefunded(jobId, client, refundAmount);

        (bool success, ) = client.call{value: refundAmount}("");
        require(success, "Client timeout refund transfer failed");
    }

    /**
     * @notice Fetches job details by ID.
     * @param jobId The job identifier.
     * @return Job struct.
     */
    function getJob(bytes32 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    /**
     * @notice Withdraws accrued validator fees for the caller.
     * @dev Pull-payment pattern decoupling fee collection from job settlement.
     */
    function withdrawValidatorFees() external nonReentrant {
        _withdrawValidatorFees(payable(msg.sender));
    }

    /**
     * @notice Withdraws accrued validator fees for caller to a designated recipient address.
     * @param recipient Destination address to receive the fees.
     */
    function withdrawValidatorFeesTo(address payable recipient) external nonReentrant {
        require(recipient != address(0), "Zero recipient address");
        _withdrawValidatorFees(recipient);
    }

    function _withdrawValidatorFees(address payable recipient) internal {
        uint256 amount = pendingValidatorFees[msg.sender];
        require(amount > 0, "No pending validator fees");

        // Checks-Effects-Interactions
        pendingValidatorFees[msg.sender] = 0;
        totalPendingValidatorFees -= amount;

        emit ValidatorFeeWithdrawn(msg.sender, recipient, amount);

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Validator fee withdrawal transfer failed");
    }
}
