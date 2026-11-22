from typing import Literal
from pydantic import BaseModel, Field, field_validator


class UsernameInput(BaseModel):
    username: str = Field(pattern=r"^[a-zA-Z0-9_]{3,24}$")

    @field_validator("username")
    @classmethod
    def normalize(cls, value):
        return value.lower()


class Credentials(UsernameInput):
    password: str = Field(min_length=7, max_length=128)


class Register(Credentials):
    legal_age: Literal[True]

    @field_validator("password")
    @classmethod
    def password_requirements(cls, value):
        if not any(character.isdigit() for character in value):
            raise ValueError("Password must include a number")
        if not any(not character.isalnum() and not character.isspace() for character in value):
            raise ValueError("Password must include a special character")
        return value


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=200)


class Tokens(BaseModel):
    access_token: str
    refresh_token: str


class AccessToken(BaseModel):
    access_token: str


class Profile(BaseModel):
    id: str
    username: str
    avatar_url: str | None


class CreateCompetition(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    mode: Literal["classic", "party", "battle"]
    battle_duration_seconds: Literal[600, 1800, 2700, 3600, 5400, 7200, 10800, 14400, 18000, 21600, 25200, 32400, 36000] | None = None
    battle_points_visible: bool | None = None
    battle_team_a_name: str | None = Field(default=None, min_length=1, max_length=40)
    battle_team_b_name: str | None = Field(default=None, min_length=1, max_length=40)

    @field_validator("name")
    @classmethod
    def trim(cls, value):
        if not value.strip():
            raise ValueError("Give your night a name")
        return value.strip()

    @field_validator("battle_team_a_name", "battle_team_b_name")
    @classmethod
    def trim_team_name(cls, value):
        return value.strip() if value is not None else value

    @field_validator("battle_team_b_name")
    @classmethod
    def different_team_names(cls, value, info):
        first = info.data.get("battle_team_a_name")
        if value and first and value.casefold() == first.casefold():
            raise ValueError("Team names must be different")
        return value


class UpdateCompetition(BaseModel):
    name: str = Field(min_length=1, max_length=60)

    @field_validator("name")
    @classmethod
    def trim(cls, value):
        if not value.strip():
            raise ValueError("Give your night a name")
        return value.strip()


class JoinCompetition(BaseModel):
    code: str = Field(pattern=r"^(?:[A-Za-z0-9]{8}|[A-Za-z0-9]{10})$")


class HistoryVisibility(BaseModel):
    hidden: bool


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
    mode: Literal["classic", "party", "battle"]
    party_started_at: int | None
    battle_started_at: int | None = None
    hidden: bool = False


class Standing(Profile):
    count: int
    challenge_points: int = 0
    points: int
    rank: int
    team: Literal["a", "b"] | None = None


class BattleTeamChoice(BaseModel):
    team: Literal["a", "b"]


class BattleMember(Profile):
    count: int | None = None
    points: int | None = None
    rank: int | None = None


class BattleTeam(BaseModel):
    key: Literal["a", "b"]
    name: str
    score: int | None
    members: list[BattleMember]


class BattleOut(BaseModel):
    status: Literal["waiting", "active", "complete", "cancelled"]
    server_time: int
    duration_seconds: int
    started_at: int | None
    ends_at: int | None
    warning_at: int | None
    warning: bool
    points_visible: bool
    my_team: Literal["a", "b"] | None
    can_start: bool
    can_change_team: bool
    can_leave: bool
    winner: Literal["a", "b", "tie"] | None
    teams: list[BattleTeam]


class PhotoOut(BaseModel):
    id: str
    user: Profile
    rear_url: str
    front_url: str
    created_at: int
    beer_count: int = Field(ge=0, le=10)
    pint_count: int = Field(ge=0, le=10)
    beer_points: int = Field(ge=0)
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
    battle: BattleOut | None = None


class DailyCelebrationOut(BaseModel):
    date: str
    display_date: str
    title: str
    fact: str
    source_title: str
    source_url: str = Field(pattern=r"^https://")
