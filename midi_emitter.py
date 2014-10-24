import sys
import midi
import midi.sequencer as sequencer
import threading
import logging
import events

drums_mapping = {
    48: 'tom1',
    47: 'tom2',
}

urls_mapping = {
    'tom1': '/',
    'tom2': '/cpuload',
}

class Emitter(object):
    def __init__(self, state):
        self.state = state

    def run(self, client, port):
        self.seq = sequencer.SequencerRead(sequencer_resolution=120)
        self.seq.subscribe_port(client, port)

        self.th = threading.Thread(target=Emitter.event_reader, args=(self,))
        self.th.daemon = True
        self.th.start()

    def event_reader(self):
        self.seq.start_sequencer()
        while True:
            event = self.seq.event_read()
            if isinstance(event, midi.NoteOnEvent):
                try:
                    logging.debug('MIDI ALSA event: %s' % event)
                    drum = drums_mapping[event.data[0]]
                    ev = events.MidiEvent(drum, urls_mapping[drum])
                    self.state.post_event(ev)
                except:
                    pass

