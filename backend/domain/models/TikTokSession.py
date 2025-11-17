import db
import AggregateRoot 

class TikTokSession(AggregateRoot, db.Model):
    __tablename__ = 'AppTikTokSession'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    