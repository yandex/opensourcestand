
class Event(object):
    pass

class MidiEvent(Event):
    def __init__(self, drum, url):
        self.drum = drum
        self.url = url

    def __str__(self):
        return '<MidiEvent drum: %s, url: %s>' % (self.drum, self.url)

class QRCodeEvent(Event):
    def __init__(self, text):
        self.text = text

    def __str__(self):
        return '<QRCodeEvent text: %s>' % (self.text)
