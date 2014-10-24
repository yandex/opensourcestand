import sqlite3

class Top(object):
    def __init__(self):
        self.db = sqlite3.connect('top.db')

    def add_result(self, user, points):
        user.points = points
        user.improvement = True
        c = self.db.cursor()

        c.execute('INSERT INTO attempts VALUES(datetime("now"), ?, ?)', (user.id, points))

        row = c.execute('SELECT userid, points FROM rating WHERE userid = ?', (user.id, )).fetchone()
        if not row or row[1] < points:
            c.execute('INSERT OR REPLACE INTO rating VALUES (datetime("now"), ?, ?, ?)', (user.id, user.name, points))
        elif row:
            user.points = row[1]
            user.improvement = False

        self.db.commit()

    def add_hresult(self, user):
        c = self.db.cursor()
        row = c.execute('SELECT * from hrating').fetchone()
        if row:
            return row
        c.execute('INSERT INTO hrating VALUES (datetime("now"), ?)', (user.id,))
        self.db.commit()
        return None

    def get_hresults(self):
        c = self.db.cursor()
        return c.execute('SELECT * from hrating').fetchone()

    def get_results(self, user):
        c = self.db.cursor()

        rating = []
        place = 0
        found = False

        for row in c.execute('SELECT date, userid, username, points FROM rating ORDER BY points DESC'):
            place += 1
            rec = dict(zip(('date', 'userid', 'user', 'points'), row))

            if place > 10:
                if found or user is None:
                    break

                if rec['userid'] != user.id:
                    continue

            rec['place'] = place
            rec['current'] = False

            if user and rec['userid'] == user.id:
                rec['current'] = True
                rec['improvement'] = user.improvement
                found = True

            rating.append(rec)

        return rating


if __name__ == '__main__':
    top = Top()
    c = top.db.cursor()

    try:
        c.execute('CREATE TABLE rating (date text, userid text PRIMARY KEY, username text, points integer)')
    except:
        pass

    try:
        c.execute('CREATE TABLE hrating (date text, userid text)')
    except:
        pass

    try:
        c.execute('CREATE TABLE attempts (date text, userid test, points integer)')
    except:
        pass


    def cleanup():
        c.execute('DELETE FROM rating')
        c.execute('DELETE FROM hrating')
        c.execute('DELETE FROM attempts')
    #cleanup()
    #for i in range(100):
    #    top.add_result('testuser%d' % i, 'Test User %d' %i, 100 * i)

    #from pprint import pprint
    #pprint(top.get_results('testuser'))

    #c.execute('DELETE FROM hrating')
    #print c.execute('SELECT * from hrating').fetchone()
    #top.db.commit()
    #print top.add_hresult('testuser')
