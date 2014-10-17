#!/usr/bin/python


import sys
import time
import midi
import midi.sequencer as sequencer
import threading



client = sys.argv[1]
port = sys.argv[2]
counter = 0

def EventReader(seq):
    global counter
    seq.start_sequencer()
    while True:
        event = seq.event_read()
        if isinstance(event,midi.NoteOnEvent):
            counter += 1

seq = sequencer.SequencerRead(sequencer_resolution=120)
seq.subscribe_port(client, port)

t = threading.Thread(target=EventReader, kwargs = {'seq': seq})
t.daemon=True
t.start()

while True:
    time.sleep(1)
    print "RPS: ", counter
    counter = 0
