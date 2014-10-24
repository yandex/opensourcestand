import sqlite3

class User(object):
    def __init__(self, id, name):
        self.id = id
        self.name = name
        self.points = 0
        self.improvement = False

    def __str__(self):
        return '<User id: %s, name: %s>' % (self.id, self.name)

class Userlist(object):
    def __init__(self):
        self.db = sqlite3.connect('users.db')

    def get_user(self, id):
        c = self.db.cursor()
        row = c.execute('SELECT id, name FROM users WHERE id = ?', (id, )).fetchone()

        if row:
            return User(row[0], row[1])

        raise KeyError('Unknown user')

if __name__ == '__main__':
    users = Userlist()
    c = users.db.cursor()

    try:
        c.execute('CREATE TABLE users (id text PRIMARY KEY, name text, email text)')
    except:
        pass

    def cleanup():
        c.execute('DELETE FROM users')
    #cleanup()
    #for i in range(100):
    #    c.execute('INSERT INTO users VALUES (?, ?, ?)', ('testuser%d' % i, 'Test User %d' %i, 'test email'))
    #users.db.commit()

    #print users.get_user('testuser1')
