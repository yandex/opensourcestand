#!/usr/bin/env python

import logging
import tornado.ioloop
import tornado.web
import os.path
import json
import uuid
from tornado import template
from pyjade.ext.tornado import patch_tornado
patch_tornado()

from tornadio2 import SocketConnection, TornadioRouter, SocketServer, event

from threading import Thread


class Client(SocketConnection):
    CONNECTIONS = set()

    def on_open(self, info):
        print 'Client connected'
        self.CONNECTIONS.add(self)
        self.emit('event', {'data': {'state': 0}})

    def on_message(self, msg):
        print 'Got', msg

    def on_close(self):
        print 'Client disconnected'
        self.CONNECTIONS.remove(self)

    @event('heartbeat')
    def on_heartbeat(self):
        pass

class MainHandler(tornado.web.RequestHandler):
    def initialize(self, template, reportUUID, state):
        self.template = template
        self.reportUUID = reportUUID
        self.state = state

    def get(self):
        if self.state is not None:
            cached_data = {
              'data': self.state.get_current_state(),
              'uuid': self.reportUUID,
            }
        else:
            cached_data = {
              'data':{},
              'uuid': self.reportUUID,
            }
        self.render(self.template, cached_data=json.dumps(cached_data))

class JsonHandler(tornado.web.RequestHandler):
    def initialize(self, reportUUID, state):
        self.reportUUID = reportUUID
        self.state = state

    def get(self):
        if self.state is not None:
            cached_data = {
              'data': self.get_data(),
              'uuid': self.reportUUID,
            }
        else:
            cached_data = {
              'data':{},
              'uuid': self.reportUUID,
            }
        self.set_status(200)
        self.set_header("Content-type", "application/json")
        self.finish(json.dumps(cached_data))

    def get_data(self):
        raise Exception('Not implemented')

class DataHandler(JsonHandler):
    def get_data(self):
        return self.state.get_current_state()

class ResultsHandler(JsonHandler):
    def get_data(self):
        return self.state.get_results()


class TopServer(object):
    def __init__(self, state):
        router = TornadioRouter(Client)
        self.reportUUID = uuid.uuid4().hex
        self.app = tornado.web.Application(
            router.apply_routes([
              (r"/", MainHandler, dict(template='index.jade', reportUUID=self.reportUUID, state=state)),
              (r"/data\.json$", DataHandler, dict(reportUUID=self.reportUUID, state=state)),
              (r"/toplist\.json$", ResultsHandler, dict(reportUUID=self.reportUUID, state=state)),
            ]),
            template_path=os.path.join(os.path.dirname(__file__), "templates"),
            static_path=os.path.join(os.path.dirname(__file__), "static"),
            debug=True,
            )

    def run(self, ioloop):
        self.server = SocketServer(self.app, io_loop=ioloop, auto_start=False)

    def send(self, data):
        for connection in Client.CONNECTIONS:
            ev = {}
            ev['uuid'] = self.reportUUID
            ev['data'] = data
            print "Sending data to client ", connection
            connection.emit('event', ev)

    def reload(self):
        for connection in Client.CONNECTIONS:
            connection.emit('reload')
