#!/usr/bin/python

import server
from tornado import ioloop


class State(object):
    RESULTS=0
    WARMUP=1
    ACTION=2
    
    def __init__(self, ioloop):
        self.ioloop = ioloop
        self.serv = server.TopServer(self)
        self.state = State.RESULTS

    def get_all_data(self):
        return {'test': 'data'}

    def run(self):
        self.serv.serve(self.ioloop)
        self.ioloop.start()

    def change_state(self, new_state):
        if new_state == State.WARMUP:
            self.ioloop.add_callback(State.warmup, self)

        if new_state == State.ACTION:
            self.ioloop.add_callback(State.action, self)

        if new_state == State.RESULTS:
            self.ioloop.add_callback(State.results, self)

    def warmup(self):
        if (self.state != State.RESULTS):
            raise Exception("Incorrect state transcision!")
        print "Hello, user"

    def action(self):
        if (self.state != State.WARMUP):
            raise Exception("Incorrect state transcision!")
        print "Go, user"

    def results(self):
        if (self.state != State.ACTION):
            raise Exception("Incorrect state transcision!")
        print "Resuts for user"

    def post_event(self, event):
        self.ioloop.add_callback(State.process_event, self, event)

    def process_event(self, event):
        print "Processing event", event

ioloop = ioloop.IOLoop.instance()

state = State(ioloop)

state.change_state(State.WARMUP)
state.post_event('test event')
state.run()

