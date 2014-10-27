import os
import zmq
import logging

class Tank(object):
    def __init__(self, host, port):
        self.host = host
        self.port = port

    def run(self):
        self.context = zmq.Context()
        self.sock = self.context.socket(zmq.PUSH)
        logging.info('binding to \'tcp://0.0.0.0:%s\'' % (self.port, ))
        self.sock.bind('tcp://0.0.0.0:%s' % (self.port, ))

    def start(self):
        logging.info('Starting tank')
        os.system("ssh %s /bin/bash -c ~/start_tank.sh" % (self.host, ))

    def check(self):
        logging.info('Checking tank')
        if not self.sock.poll(100, zmq.POLLOUT):
            raise Exception('Tank is not ready')
        #self.sock.send_json((0,), zmq.NOBLOCK)

    def stop(self):
        logging.info('Stopping tank')
        try:
            self.sock.send_json(('stop', ), zmq.NOBLOCK)
        except:
            logging.error('Tank is not responding')

    def fire(self, url, drum):
        logging.debug('Firing with drum %s to url %s' % (drum, url))
        self.sock.send_json([0, url, drum], zmq.NOBLOCK)

