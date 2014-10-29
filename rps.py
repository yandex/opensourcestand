class RPSCounter(object):
    H4X0R = ['tom1', 'tom2', 'floor_tom', 'tom2', 'tom2', 'floor_tom', 'ride_edge']

    def __init__(self):
        self.hresult = False
        self.cleanup()

    def cleanup(self):
        self.counter = 0
        self.lsl = []
        self.h4x0r_list = []

    def update(self, ts):
        if self.lsl:
            while self.lsl and ts - self.lsl[0][0] > 1:
                self.lsl.pop(0)

    def add_event(self, ts, event):
        self.counter += 1
        self.lsl.append((ts, event))
        self.update(ts)

        self.h4x0r_list.append(event.drum)
        diff = len(self.h4x0r_list) - len(RPSCounter.H4X0R)
        if diff > 0:
            del self.h4x0r_list[:diff]

        if self.h4x0r_list == RPSCounter.H4X0R and not self.hresult:
            raise Exception("H4X0R")

    def current_rps(self, ts):
        self.update(ts)
        return len(self.lsl)
