import sys
import midi
import midi.sequencer as sequencer
import threading
import logging
import events

drums_mapping = {
    48: 'tom1',
    45: 'tom2',
    43: 'floor_tom',
    38: 'snare',
    40: 'snare_rim',
    46: 'hat',
    26: 'hat_edge',
    42: 'hat_closed',
    22: 'hat_closed_edge',
    54: 'crash',
    55: 'crash_edge',
    51: 'ride',
    53: 'ride_edge',
    36: 'bass',
}

#44: 'hat_pedal',
urls_mapping = {
    'tom1': '/',
    'tom2': '/',
    'floor_tom': '/',
    'snare': '/cpu_burn',
    'snare_rim': '/',
    'hat': '/',
    'hat_edge': '/',
    'hat_closed': '/',
    'hat_closed_edge': '/',
    'hat_pedal': '/',
    'crash': '/',
    'crash_edge': '/',
    'ride': '/',
    'ride_edge': '/',
    'bass': '/heavy',
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
                    logging.debug('MIDI event: %s' % ev)
                    self.state.post_event(ev)
                except:
                    pass

