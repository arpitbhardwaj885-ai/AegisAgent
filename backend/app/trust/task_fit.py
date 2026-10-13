from app.trust.models import TaskEvidence, AgentCapabilities
from app.trust.normalization import clamp

def calculate_task_fit(task: TaskEvidence, agent_caps: AgentCapabilities) -> float:
    """
    Calculate a 0-100 score for how well the agent matches the task.
    """
    score = 0.0
    
    # 1. Capability match (up to 70 points)
    if not task.required_capabilities:
        score += 70.0
    else:
        matched = 0
        agent_caps_lower = [c.lower() for c in agent_caps.capabilities]
        for req in task.required_capabilities:
            if req.lower() in agent_caps_lower:
                matched += 1
        
        cap_score = (matched / len(task.required_capabilities)) * 70.0
        score += cap_score
        
    # 2. Domain match (up to 30 points)
    if task.domain is None:
        score += 30.0
    else:
        if agent_caps.domain and agent_caps.domain.lower() == task.domain.lower():
            score += 30.0
            
    return clamp(score)
