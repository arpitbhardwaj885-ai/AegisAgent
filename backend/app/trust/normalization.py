import math
from typing import List

def clamp(value: float, min_val: float = 0.0, max_val: float = 100.0) -> float:
    try:
        val = float(value)
        if math.isnan(val):
            return min_val
        if math.isinf(val):
            return max_val if val > 0 else min_val
        return max(min_val, min(max_val, val))
    except (ValueError, TypeError):
        return min_val

def safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
    try:
        num = float(numerator)
        den = float(denominator)
        if math.isnan(num) or math.isnan(den) or den == 0.0:
            return default
        return num / den
    except (ValueError, TypeError):
        return default

def calculate_hhi(shares: List[float]) -> float:
    """
    Calculate Herfindahl-Hirschman Index (HHI).
    Input shares should be fractions (e.g., [0.5, 0.3, 0.2]).
    Output is 0.0 to 10000.0.
    """
    if not shares:
        return 0.0
    
    # Ensure they sum to 1.0 (or normalize them if they don't but they represent counts)
    total_share = sum(shares)
    if total_share <= 0:
        return 0.0
    
    normalized_shares = [safe_divide(s, total_share) for s in shares]
    
    hhi = 0.0
    for share in normalized_shares:
        # HHI uses percentage points squared, so 0.5 -> 50 -> 2500
        percentage = share * 100.0
        hhi += (percentage ** 2)
        
    return hhi

def normalize_hhi_to_risk(hhi: float) -> float:
    """
    Convert HHI (0-10000) to a 0-100 risk score.
    HHI < 1500 is unconcentrated.
    HHI 1500-2500 is moderately concentrated.
    HHI > 2500 is highly concentrated.
    """
    hhi = clamp(hhi, 0.0, 10000.0)
    # Let's say HHI 0 is 0 risk, HHI 10000 is 100 risk.
    # We can use a simple linear scaling, or piecewise.
    # Linear:
    return hhi / 100.0
