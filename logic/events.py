from abc import abstractmethod, ABC
from data.framestack import FrameStack
from data.normalisedframe import NormalisedFrame
from logic.perspective import TENNIS_COURT_LENGTH

threshold = 0.1

class EventInterface(ABC):
    @abstractmethod
    def test_event(self, frames: FrameStack):
        pass

class RallyEvent:
    def test_event(self, frames: FrameStack):
        frames_sided = map(self.isRightOfNet, frames.takeFrames(2))
        return any(frames_sided) and not all(frames_sided)
        # take 2 frames
        # if the ball has changed side of the net then return true

    def isRightOfNet(self, frame: NormalisedFrame):
        ball_positions = frame.ball.pos
        return abs(ball_positions.x - (TENNIS_COURT_LENGTH/2)) < threshold

class BounceOrShotEvent:
    def test_event(self, frames: FrameStack):
        pass
        # take the last 0.05 seconds
        # if the ball has not changed sign but changed direction by more than some tolerance k then we have a bounce
        # if not we have a shot