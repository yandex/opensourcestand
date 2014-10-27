import sys
import serial
import events
import tornado
import logging

class Emitter(object):
    def __init__(self, state, ioloop):
        self.state = state
        self.ioloop = ioloop
        self.data = ''

    def on_data(self, fd, evs):
        char = self.scanner.read(1)

        if char == '\r':
            return

        if char == '\n':
            # http://yaconf.yandex.net/?1281377701
            userid = self.data.split('?')[1]
            ev = events.QRCodeEvent(userid)
            self.state.post_event(ev)
            self.data = ''
            return

        self.data += char

    def run(self, port, baudrate=9600):
        self.scanner = serial.Serial(port, baudrate)
        self.ioloop.add_handler(self.scanner.fileno(), self.on_data, tornado.ioloop.IOLoop.READ)

