import numpy as np
from data.framestack import FrameStack
from data.frame import NormalisedFrame
from logic.perspective import TENNIS_COURT_LENGTH


# --- EVENT CLASSES ---

class Event:
    def to_string(self):
        return self.__class__.__name__


# Ideas
# Volley Event
# Plr Left, Right, Up, Down event
# Ball Stopped Event
# Ball In/Out event
class RallyEvent(Event): pass
class BounceEvent(Event): pass
class ShotEvent(Event): pass
class RightOfNetEvent(Event): pass
class LeftOfNetEvent(Event): pass
class VolleyEvent(Event): pass
class PlayerUpEvent(Event): pass
class PlayerDownEvent(Event): pass
class PlayerLeftEvent(Event): pass
class PlayerRightEvent(Event): pass
class BallStoppedEvent(Event): pass
class BallInEvent(Event): pass
class BallOutEvent(Event): pass

# --- BASE TESTER ---

class SideTester:
    def __init__(self, side: str):
        self.side = side
        self.net_pos_x = TENNIS_COURT_LENGTH/2

    def test_event(self, frames: FrameStack):
        recent = frames.takeFrames(1)

        # Guard against nulls
        if not recent or recent[0].ball is None:
            return None

        ball_x = recent[0].ball.pos.x

        if self.side == "right":
            if ball_x > self.net_pos_x:
                return RightOfNetEvent()

        if self.side == "left":
            if ball_x <= self.net_pos_x:
                return LeftOfNetEvent()

        return None

# --- COMPLEX TESTERS ---

class BounceOrShotTester:
    def test_event(self, frames: FrameStack):
        recent = frames.takeFrames(3)

        # Ensure we have 3 frames and all have ball data
        if len(recent) < 3 or any(f is None or f.ball is None for f in recent):
            return None

        v1_x = recent[1].ball.pos.x - recent[0].ball.pos.x
        v2_x = recent[2].ball.pos.x - recent[1].ball.pos.x

        # Detect Shot: Horizontal direction reversal
        if (v1_x > 0) != (v2_x > 0) and abs(v1_x) > 0.05:
            return ShotEvent()

        # Detect Bounce: Significant loss of horizontal velocity
        if abs(v1_x) > 0:
            speed_ratio = abs(v2_x) / abs(v1_x)
            if speed_ratio < 0.8:
                return BounceEvent()

        return None

class PlayerMovementTester:
    def __init__(self, player_index: int, direction: str, movement_threshold: float = 0.5):
        self.player_index = player_index
        self.direction = direction
        self.movement_threshold = movement_threshold

    def test_event(self, frames: FrameStack):
        recent = frames.takeFrames(5)  # Look at movement over ~0.17 seconds

        # Guard against nulls
        if len(recent) < 5:
            return None

        # Get the correct player based on index
        players = []
        for f in recent:
            if f is None:
                players.append(None)
            elif self.player_index == 0 and f.player1 is not None:
                players.append(f.player1)
            elif self.player_index == 1 and f.player2 is not None:
                players.append(f.player2)
            else:
                players.append(None)

        if any(p is None for p in players):
            return None

        # Calculate net displacement
        start_pos = players[0].pos
        end_pos = players[-1].pos

        dx = end_pos.x - start_pos.x
        dy = end_pos.y - start_pos.y

        # Check direction-specific movement
        if self.direction == "up":
            if dy > self.movement_threshold:
                return PlayerUpEvent()
        elif self.direction == "down":
            if dy < -self.movement_threshold:
                return PlayerDownEvent()
        elif self.direction == "left":
            if dx < -self.movement_threshold:
                return PlayerLeftEvent()
        elif self.direction == "right":
            if dx > self.movement_threshold:
                return PlayerRightEvent()

        return None

class BallStoppedTester:
    def __init__(self, velocity_threshold: float = 0.05):
        self.min_stopped_frames = 5
        self.velocity_threshold = velocity_threshold
        
    def test_event(self, frames: FrameStack):
        recent = frames.takeFrames(self.min_stopped_frames + 1)

        # Guard against nulls
        if len(recent) < self.min_stopped_frames + 1:
            return None

        if any(f is None or f.ball is None for f in recent):
            return None

        # Check velocity for consecutive frames
        stopped_count = 0
        for i in range(len(recent) - 1):
            dx = recent[i + 1].ball.pos.x - recent[i].ball.pos.x
            dy = recent[i + 1].ball.pos.y - recent[i].ball.pos.y
            
            # Ball only has x and y coordinates based on Coord class
            velocity = np.sqrt(dx**2 + dy**2)

            if velocity < self.velocity_threshold:
                stopped_count += 1

        # Ball has been stopped for minimum duration
        if stopped_count >= self.min_stopped_frames:
            return BallStoppedEvent()

        return None

class BallInOutTester:
    def __init__(self, court_x_min: float = 0.0, court_x_max: float = 23.77,
                 court_z_min: float = 0.0, court_z_max: float = 10.97):
        self.last_state = None  # Track last known state to detect transitions
        self.court_x_min = court_x_min
        self.court_x_max = court_x_max
        self.court_z_min = court_z_min
        self.court_z_max = court_z_max

    def test_event(self, frames: FrameStack):
        recent = frames.takeFrames(3)

        # Guard against nulls
        if len(recent) < 3 or any(f is None or f.ball is None for f in recent):
            return None

        ball = recent[-1].ball

        # Check if ball is on or near ground (bounce point)
        # Note: Ball only has x and y coordinates, so we use y for height
        if ball.pos.y > 0.2:
            return None  # Only check when ball is near ground

        # Check if ball has just bounced (reversal in vertical velocity)
        # Since we only have x,y we'll check y as the vertical component
        v1_y = recent[1].ball.pos.y - recent[0].ball.pos.y
        v2_y = recent[2].ball.pos.y - recent[1].ball.pos.y
        
        just_bounced = (v1_y < 0) and (v2_y > 0)

        if not just_bounced:
            return None

        # Check boundaries (using only x coordinate since we don't have z)
        is_in_bounds = (self.court_x_min <= ball.pos.x <= self.court_x_max)

        current_state = "in" if is_in_bounds else "out"

        # Only trigger event on state change or first detection
        if self.last_state != current_state:
            self.last_state = current_state
            if is_in_bounds:
                return BallInEvent()
            else:
                return BallOutEvent()

        return None

# --- REGISTRY ---

class EventTesters:
    # Instantiate SideTester twice with different configurations
    LEFT_SIDE = SideTester(side="left")
    RIGHT_SIDE = SideTester(side="right")

    # Physics-based detection
    BOUNCE_SHOT = BounceOrShotTester()

    # Player movement (Player 0 - player1)
    PLAYER0_UP = PlayerMovementTester(player_index=0, direction="up")
    PLAYER0_DOWN = PlayerMovementTester(player_index=0, direction="down")
    PLAYER0_LEFT = PlayerMovementTester(player_index=0, direction="left")
    PLAYER0_RIGHT = PlayerMovementTester(player_index=0, direction="right")

    # Player movement (Player 1 - player2)
    PLAYER1_UP = PlayerMovementTester(player_index=1, direction="up")
    PLAYER1_DOWN = PlayerMovementTester(player_index=1, direction="down")
    PLAYER1_LEFT = PlayerMovementTester(player_index=1, direction="left")
    PLAYER1_RIGHT = PlayerMovementTester(player_index=1, direction="right")

    # Ball state
    BALL_STOPPED = BallStoppedTester()
    BALL_IN_OUT = BallInOutTester()

    # Java-style .values() equivalent
    ALL = [
        LEFT_SIDE, RIGHT_SIDE,
        BOUNCE_SHOT,
        PLAYER0_UP, PLAYER0_DOWN, PLAYER0_LEFT, PLAYER0_RIGHT,
        PLAYER1_UP, PLAYER1_DOWN, PLAYER1_LEFT, PLAYER1_RIGHT,
        BALL_STOPPED, BALL_IN_OUT
    ]