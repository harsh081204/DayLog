import os
import jwt
from datetime import datetime, timezone
from typing import Optional

from fastapi import Cookie, HTTPException

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"
COOKIE_NAME = "token"


def get_user_id_from_token(token: str) -> Optional[str]:
    if not JWT_SECRET:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("user_id")
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
    except Exception:
        return None


async def get_current_user_id(token: Optional[str] = Cookie(None)):
    if not token:
        raise HTTPException(status_code=401, detail="not authenticated")
    user_id = get_user_id_from_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="invalid token")
    return user_id
