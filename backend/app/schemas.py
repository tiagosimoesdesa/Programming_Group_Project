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
    mode: Literal["classic", "party"]

    @field_validator("name")
    @classmethod
    def trim(cls, value):
        if not value.strip():
            raise ValueError("Give your night a name")
        return value.strip()


class JoinCompetition(BaseModel):
    code: str = Field(pattern=r"^(?:[A-Za-z0-9]{8}|[A-Za-z0-9]{10})$")


class EventOut(BaseModel):
    id: str
    name: str
    host_id: str
    code: str
    created_at: int
    ended_at: int | None
    revision: int
    participants: int
    my_role: Literal["player", "spectator"] = "player"
    mode: Literal["classic", "party"]
    party_started_at: int | None


class Standing(Profile):
    count: int
    challenge_points: int = 0
    points: int
    rank: int


class PhotoOut(BaseModel):
    id: str
    user: Profile
    rear_url: str
    front_url: str
    created_at: int
    beer_count: int = Field(ge=0, le=10)
    reactions: dict[str, int] = Field(default_factory=dict)
    my_reaction: str | None = None
    kind: Literal["drink", "challenge"] = "drink"
    challenge_prompt: str | None = None


class ReactionIn(BaseModel):
    emoji: Literal["❤️", "😂", "🔥"] | None


class ClaimIn(BaseModel):
    prompt: Literal["group", "yellow", "pose"]
    submission_id: str


class VoteIn(BaseModel):
    approve: bool


class ChallengeResult(BaseModel):
    id: str
    prompt: str
    photo: PhotoOut
    approvals: int
    required: int
    status: Literal["approved", "pending", "not_approved"]
    can_vote: bool
    my_vote: bool | None


class SocialOut(BaseModel):
    enabled: bool
    spectator_code: str | None
    spectators: int
    prompts: dict[str, str]
    claims: list[ChallengeResult]
    scores: dict[str, int]


class PartyRoundOut(BaseModel):
    id: str
    sequence: int
    prompt: str
    starts_at: int
    ends_at: int


class PartyAttemptOut(BaseModel):
    id: str
    round_id: str
    prompt: str
    photo: PhotoOut
    approvals: int
    required: int
    status: Literal["approved", "pending", "not_approved"]
    can_vote: bool
    my_vote: bool | None


class PartyOut(BaseModel):
    status: Literal["waiting", "active", "complete", "ended"]
    server_time: int
    started_at: int | None
    ends_at: int | None
    can_start: bool
    active_round: PartyRoundOut | None
    rounds: list[PartyRoundOut]
    attempts: list[PartyAttemptOut]
    scores: dict[str, int]


class RecapMoment(BaseModel):
    user: Profile
    first: PhotoOut | None
    last: PhotoOut | None


class EventDetail(BaseModel):
    competition: EventOut
    standings: list[Standing]
    feed: list[PhotoOut]
    next_cursor: str | None
    recap: list[RecapMoment] = Field(default_factory=list)
