import db
from datetime import datetime


class AggregateRoot:
    created = db.Column(db.DateTime, nullable=False, default=datetime.now)
    updated = db.Column(
        db.DateTime, default=datetime.now, onupdate=datetime.now)