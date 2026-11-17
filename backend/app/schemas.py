from typing import Literal
from pydantic import BaseModel, Field, field_validator


class Credentials(BaseModel):
    username: str = Field(pattern=r"^[a-zA-Z0-9_]{3,24}$")
    password: str = Field(min_length=10, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize(cls, value):
        return value.lower()


class Register(Credentials):
    legal_age: Literal[True]


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=200)


class Tokens(BaseModel):
    access_token: str
    refresh_token: str


class Profile(BaseModel):
    id: str
    username: str
    avatar_url: str | None


class CreateCompetition(BaseModel):
    name: str = Field(min_length=1, max_length=60)

    @field_validator("name")
    @classmethod
    def trim(cls, value):
        if not value.strip():
            raise ValueError("Give your night a name")
        return value.strip()


class JoinCompetition(BaseModel):
    code: str = Field(pattern=r"^[A-Za-z0-9]{8}$")


class EventOut(BaseModel):
    id: str
    name: str
    host_id: str
    code: str
    created_at: int
    ended_at: int | None
    revision: int
    participants: int


class Standing(Profile):
    count: int
    points: int
    rank: int


class PhotoOut(BaseModel):
    id: str
    user: Profile
    rear_url: str
    front_url: str
    created_at: int


class EventDetail(BaseModel):
    competition: EventOut
    standings: list[Standing]
    feed: list[PhotoOut]
    next_cursor: str | None
