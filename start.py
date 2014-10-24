#!/usr/bin/python

import os
import server
import tornado
import events
import rps
import top
import tank
import users
import midi_emitter
import qrcode_emitter
from tornado import ioloop
from tornado import options
import logging


class State(object):
    RESULTS=0
    GREETINGS=1
    COUNTDOWN=2
    ACTION=3
    HRESULTS=4

    COUNTDOWN_TIME = 3
    ACTION_TIME = 6
    

    def __init__(self, ioloop):
        self.ioloop = ioloop
        self.serv = server.TopServer(self)
        self.tank = tank.Tank(options.options.tank, 43000)
        self.state = State.RESULTS
        self.user = None
        self.rps = rps.RPSCounter()
        self.top = top.Top()
        self.users = users.Userlist()

        self.timer_counter = None
        self.timer_fn = None
        self.timer_cb = tornado.ioloop.PeriodicCallback(self.timer, 1000, self.ioloop)


    def get_current_state(self):
        return {'state': self.state,
                'user': self.user.name if self.user else None,
                'timer': self.timer_counter,
                'rps': self.rps.current_rps(self.ioloop.time())}


    def get_results(self):
        return self.top.get_results(self.user)

    def run(self):
        self.timer_cb.start()
        self.serv.run(self.ioloop)
        self.tank.run()
        self.rps.hresult = self.top.get_hresults()
        self.ioloop.start()


    def greetings(self, event):
        if (self.state != State.RESULTS):
            raise Exception('Incorrect state transcision!')

        # TODO: get user name from QRCode text
        self.user = self.users.get_user(event.text)
        logging.info('Hello, %s' % self.user)
        self.state = State.GREETINGS
        self.rps.cleanup()


    def countdown(self):
        if (self.state != State.GREETINGS):
            raise Exception('Incorrect state transcision!')

        logging.info('Prepare, %s' % self.user)
        self.state = State.COUNTDOWN
        self.timer_counter = State.COUNTDOWN_TIME
        self.timer_fn = State.tank_check
        self.tank.start()


    def tank_check(self):
        logging.info('Tank check')
        try:
            self.tank.check()
            self.action()
        except:
            logging.info('Tank check failed')
            self.timer_counter = 1
            self.timer_fn = State.tank_check


    def action(self):
        if (self.state != State.COUNTDOWN):
            raise Exception('Incorrect state transcision!')

        logging.info('Go, %s' % self.user)
        self.state = State.ACTION
        self.timer_counter = State.ACTION_TIME
        self.timer_fn = State.results


    def results(self):
        if (self.state != State.ACTION) and (self.state != state.HRESULTS):
            raise Exception('Incorrect state transcision!')

        self.tank.stop()
        self.state = State.RESULTS
        logging.info('Resuts for %s' % self.user)
        logging.info('Points earned: %d' % self.rps.counter)
        self.top.add_result(self.user, self.rps.counter)
        logging.info('Stored results: %d, improved: %s' % (self.user.points, self.user.improvement))


    def fire(self, event):
        try:
            self.tank.fire(event.url, event.drum)
            self.rps.add_event(self.ioloop.time(), event)
        except Exception as e:
            if e.message and e.message[0] == 'H':
                self.hresults()


    def hresults(self):
        if (self.state != State.ACTION):
            raise Exception('Incorrect state transcision!')

        logging.info('Pre-hack for %s' % self.user)
        if not self.top.add_hresult(self.user):
            self.rps.hresult = True
            logging.info('Hacked!!')
        self.state = State.HRESULTS
        self.timer_counter = State.COUNTDOWN_TIME
        self.timer_fn = State.results


    def timer(self):
        if self.timer_counter is None:
            return

        logging.debug('timer %d' % self.timer_counter)
        if self.timer_counter > 0:
            self.timer_counter -= 1;

        if self.timer_counter == 0:
            self.timer_counter = None
            self.timer_fn(self)


    def post_event(self, event):
        self.ioloop.add_callback(State.process_event, self, event)

    def process_event(self, event):
        logging.debug('Processing event %s, state: %d' % (event, self.state))
        if self.state == State.RESULTS:
            if isinstance(event, events.QRCodeEvent):
                self.greetings(event)
                return

        if isinstance(event, events.MidiEvent):
            if (self.state == State.GREETINGS):
                self.countdown()
                return

            if (self.state == State.ACTION):
                self.fire(event)
                return


options.define('config', type=str, help='Path to config file',
               callback=lambda path: options.parse_config_file(path, final=False))
options.define('tank', type=str, help='Tank host\'s ip address', default='127.0.0.1')
options.define('midi_device', type=int, help='Midi device number', default=24)
options.define('midi_port', type=int, help='Midi port number', default=0)
options.define('qrscanner_port', type=str, help='QRCode scanner port', default='/dev/ttyUSB0')

options.parse_command_line()
ioloop = ioloop.IOLoop.instance()

state = State(ioloop)

MidiE = midi_emitter.Emitter(state)
MidiE.run(options.options.midi_device, options.options.midi_port)

QRE = qrcode_emitter.Emitter(state, ioloop)
QRE.run(options.options.qrscanner_port)

state.run()

