from .frame import Frame

class EventFrame:
  def __init__(self, frameIndex: int, event: str):
    self.frameIndex = frameIndex
    self.event = event