import os

def _load_env_file():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(os.getcwd(), ".env"),
        os.path.abspath(os.path.join(current_dir, "..", "..", "..", ".env")),
        os.path.abspath(os.path.join(current_dir, "..", "..", "..", "..", ".env")),
    ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k, v = k.strip(), v.strip()
                            if k not in os.environ:
                                os.environ[k] = v
            except Exception:
                pass
            break

_load_env_file()

# Monad Testnet Settings
DEFAULT_RPC_URL = os.getenv("MONAD_RPC_URL", "https://testnet-rpc.monad.xyz")
DEFAULT_CHAIN_ID = int(os.getenv("MONAD_CHAIN_ID", "10143"))

# Contract Addresses (Deployed)
IDENTITY_REGISTRY_ADDRESS = os.getenv(
    "IDENTITY_REGISTRY_ADDRESS", "0xa7A27f96d4e8f58d701D42229d5097A69694Ca4B"
)
REPUTATION_REGISTRY_ADDRESS = os.getenv(
    "REPUTATION_REGISTRY_ADDRESS", "0x387948228a43351F2D33E83Db22576F535c85C74"
)
VALIDATION_REGISTRY_ADDRESS = os.getenv(
    "VALIDATION_REGISTRY_ADDRESS", "0x802DE575B528453C8208d5201e27464d63970e2b"
)
HIRING_ESCROW_ADDRESS = os.getenv(
    "HIRING_ESCROW_ADDRESS", "0x28243a3EA0c93CD5FbA6614EAff8980B4A8b0f29"
)

# Discovery Settings
DISCOVERY_MAX_SCAN_LIMIT = int(os.getenv("DISCOVERY_MAX_SCAN_LIMIT", "50"))

