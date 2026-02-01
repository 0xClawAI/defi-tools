# Uniswap V4 Token Swap on Base - Complete Guide

## 1. Key Contract Addresses (Base Mainnet)

```
PoolManager: 0x498581fF718922c3f8e6A244956aF099B2652b2b
SwapRouter02: 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4
Quoter: 0x0d5e0f971ed27fbff6c2837bf31316121532048d
```

## 2. Understanding Uniswap V4 Architecture

V4 is fundamentally different from V3:
- **Singleton Architecture**: All pools live in one `PoolManager` contract
- **PoolKey**: Unique identifier instead of pool addresses
- **Hooks**: Customizable logic attached to pools

For Clanker tokens, pools are typically initialized with WETH as the base currency.

## 3. Getting the PoolKey

```python
from web3 import Web3
import struct

def get_pool_key(token_address: str, hook_address: str = None) -> dict:
    """
    Construct PoolKey for a token paired with WETH
    For Clanker tokens on Base, typically no hooks
    """
    WETH = "0x4200000000000000000000000000000000000006"
    
    # Currency ordering: lower address first
    token0, token1 = sorted([WETH.lower(), token_address.lower()])
    
    return {
        "currency0": Web3.to_checksum_address(token0),
        "currency1": Web3.to_checksum_address(token1),
        "fee": 3000,  # 0.3% (common for new tokens)
        "tickSpacing": 60,  # Standard for 0.3% fee tier
        "hooks": hook_address or "0x0000000000000000000000000000000000000000"
    }

# For MOMOKA token
pool_key = get_pool_key("0xcf10D8823c3557FB31CDcd1Cc5421191175A4f34")
```

## 4. Complete Python Swap Code

```python
from web3 import Web3
from eth_account import Account
import json

# Connect to Base
w3 = Web3(Web3.HTTPProvider("https://mainnet.base.org"))

# Addresses
SWAP_ROUTER = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4"
WETH = "0x4200000000000000000000000000000000000006"

# SwapRouter02 ABI (relevant functions)
ROUTER_ABI = json.loads('''[
    {
        "name": "swap",
        "type": "function",
        "inputs": [
            {
                "name": "key",
                "type": "tuple",
                "components": [
                    {"name": "currency0", "type": "address"},
                    {"name": "currency1", "type": "address"},
                    {"name": "fee", "type": "uint24"},
                    {"name": "tickSpacing", "type": "int24"},
                    {"name": "hooks", "type": "address"}
                ]
            },
            {
                "name": "params",
                "type": "tuple",
                "components": [
                    {"name": "zeroForOne", "type": "bool"},
                    {"name": "amountSpecified", "type": "int256"},
                    {"name": "sqrtPriceLimitX96", "type": "uint160"}
                ]
            },
            {"name": "hookData", "type": "bytes"}
        ],
        "outputs": [{"name": "delta", "type": "int256"}]
    }
]''')

def swap_eth_for_token(
    token_address: str,
    eth_amount: float,
    private_key: str,
    slippage_pct: float = 5.0
):
    """
    Swap ETH for a Uniswap V4 token on Base
    """
    account = Account.from_key(private_key)
    router = w3.eth.contract(address=SWAP_ROUTER, abi=ROUTER_ABI)
    
    amount_in_wei = w3.to_wei(eth_amount, 'ether')
    
    # Build PoolKey
    token0, token1 = sorted([WETH.lower(), token_address.lower()])
    pool_key = (
        Web3.to_checksum_address(token0),
        Web3.to_checksum_address(token1),
        3000,  # fee
        60,    # tickSpacing
        "0x0000000000000000000000000000000000000000"  # no hooks
    )
    
    # Determine swap direction
    zero_for_one = WETH.lower() < token_address.lower()  # True if WETH is token0
    
    # Swap params: negative = exact input, positive = exact output
    # sqrtPriceLimitX96: 0 means no limit (use MIN or MAX based on direction)
    sqrt_limit = 0 if zero_for_one else 2**160 - 1
    
    swap_params = (
        zero_for_one,
        -amount_in_wei,  # Negative for exact input
        sqrt_limit
    )
    
    # Build transaction
    tx = router.functions.swap(
        pool_key,
        swap_params,
        b""  # hookData
    ).build_transaction({
        'from': account.address,
        'value': amount_in_wei,  # Send ETH
        'gas': 300000,
        'maxFeePerGas': w3.eth.gas_price * 2,
        'maxPriorityFeePerGas': w3.to_wei(0.001, 'gwei'),
        'nonce': w3.eth.get_transaction_count(account.address),
        'chainId': 8453  # Base
    })
    
    # Sign and send
    signed = w3.eth.account.sign_transaction(tx, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    
    print(f"Tx sent: {tx_hash.hex()}")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    print(f"Status: {'Success' if receipt.status == 1 else 'Failed'}")
    
    return receipt

# Usage example
# receipt = swap_eth_for_token(
#     token_address="0xcf10D8823c3557FB31CDcd1Cc5421191175A4f34",  # MOMOKA
#     eth_amount=0.01,
#     private_key="YOUR_PRIVATE_KEY"
# )
```

## 5. Getting a Quote First

```python
QUOTER = "0x0d5e0f971ed27fbff6c2837bf31316121532048d"

QUOTER_ABI = json.loads('''[
    {
        "name": "quoteExactInputSingle",
        "type": "function",
        "inputs": [
            {
                "name": "params",
                "type": "tuple",
                "components": [
                    {
                        "name": "poolKey",
                        "type": "tuple",
                        "components": [
                            {"name": "currency0", "type": "address"},
                            {"name": "currency1", "type": "address"},
                            {"name": "fee", "type": "uint24"},
                            {"name": "tickSpacing", "type": "int24"},
                            {"name": "hooks", "type": "address"}
                        ]
                    },
                    {"name": "zeroForOne", "type": "bool"},
                    {"name": "exactAmount", "type": "uint128"},
                    {"name": "hookData", "type": "bytes"}
                ]
            }
        ],
        "outputs": [
            {"name": "amountOut", "type": "uint256"},
            {"name": "sqrtPriceX96After", "type": "uint160"},
            {"name": "initializedTicksCrossed", "type": "uint32"}
        ],
        "stateMutability": "view"
    }
]''')

def get_quote(token_address: str, eth_amount: float):
    """Get expected output tokens for input ETH"""
    quoter = w3.eth.contract(address=QUOTER, abi=QUOTER_ABI)
    
    token0, token1 = sorted([WETH.lower(), token_address.lower()])
    pool_key = (
        Web3.to_checksum_address(token0),
        Web3.to_checksum_address(token1),
        3000, 60,
        "0x0000000000000000000000000000000000000000"
    )
    
    zero_for_one = WETH.lower() < token_address.lower()
    amount_in = w3.to_wei(eth_amount, 'ether')
    
    quote_params = (pool_key, zero_for_one, amount_in, b"")
    
    result = quoter.functions.quoteExactInputSingle(quote_params).call()
    return result[0]  # amountOut
```

## 6. Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "Pool does not exist" | Check fee tier (try 500, 3000, 10000) |
| "Insufficient liquidity" | Pool may be new/empty, check on Uniswap UI |
| "Hook validation failed" | Clanker pools may use hooks - check Clanker docs |
| Transaction reverts | Increase slippage, check sqrtPriceLimitX96 |

## 7. Alternative: Use Uniswap SDK

If you prefer TypeScript/JavaScript, the `@uniswap/v4-sdk` handles PoolKey construction:

```typescript
import { Pool, PoolKey } from '@uniswap/v4-sdk'
import { Token, WETH9 } from '@uniswap/sdk-core'

const MOMOKA = new Token(8453, '0xcf10D8823c3557FB31CDcd1Cc5421191175A4f34', 18)
const poolKey = PoolKey.fromTokens(WETH9[8453], MOMOKA, 3000, 60, '0x...')
```

---

**Note:** Clanker-deployed tokens may use custom hooks. Check the pool initialization event on Basescan to get the exact hook address if swaps fail.
