import zmq

ctx = zmq.Context()
s = ctx.socket(zmq.PUSH)
s.bind('tcp://127.0.0.1:43000')
