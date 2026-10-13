import pytest
from unittest.mock import MagicMock
from app.trust.blockchain.provider import Web3Provider
from app.trust.blockchain.errors import RPCError, ContractError
from web3.exceptions import Web3Exception

def test_invalid_rpc():
    provider = Web3Provider(rpc_url="http://invalid.local")
    provider.w3.is_connected = MagicMock(return_value=False)
    with pytest.raises(RPCError):
        provider.check_connection()

def test_wrong_chain():
    provider = Web3Provider(chain_id=123)
    provider.w3.is_connected = MagicMock(return_value=True)
    
    mock_eth = MagicMock()
    mock_eth.chain_id = 999
    provider.w3.eth = mock_eth
    
    with pytest.raises(RPCError) as exc:
        provider.check_connection()
    assert "Wrong chain ID" in str(exc.value)

def test_contract_call_failure():
    provider = Web3Provider()
    provider.w3.is_address = MagicMock(return_value=False)
    with pytest.raises(ContractError):
        provider.get_contract("invalid_address", [])
