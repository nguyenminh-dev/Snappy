from domain.db import db
from typing import Any, List, Union
from flask import Response, jsonify
from werkzeug.wrappers import Response as ResponseType


def ok(resource: Union[Any, List[Any]]) -> Response:
    """
    Returns HTTP 200 with serialized model(s)
    Works for any SQLAlchemy model that implements `serialize()`.
    """
    if isinstance(resource, db.Model):
        return jsonify(resource.serialize())
    elif isinstance(resource, list) and all(isinstance(r, db.Model) for r in resource):
        return jsonify([r.serialize() for r in resource])
    else:
        raise TypeError("Resource must be a SQLAlchemy model or a list of models")


def no_content() -> ResponseType:
    """
    Helper function that returns an http status code 204.
    """

    return Response(status=204)


def created(model: Any) -> ResponseType:
    """
    Helper function that returns an http status code 201 and the
    serialized model.

    @param model: Model to be serialized
    """

    return jsonify(model.serialize()), 201


def bad_request(exception: Exception) -> ResponseType:
    """
    Helper function that returns an http status code 400 and an error message.

    @param exception: The exception throwed.
    """

    return Response(response=str(exception), status=400)


def not_found(resource: str) -> ResponseType:
    """
    Helper function that returns an http status code 404.

    @param resource: Resource name that was not found.
    """

    return Response(response=f'{resource} not found.'.capitalize(), status=404)


def not_allowed() -> ResponseType:
    """
    Helper function that returns an http status code 405.
    """

    return Response(response='Method not allowed.', status=405)


def internal_error() -> ResponseType:
    """
    Helper function that returns an http status code 500.
    """

    return Response(response='Internal Error.', status=500)
