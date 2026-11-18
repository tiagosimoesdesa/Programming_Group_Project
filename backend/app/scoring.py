"""Beer scoring shared by Python responses and SQL leaderboard expressions.

Counts are stored independently. Changing these weights recalculates scores for
all submissions, including historical ones; it never changes beer quantities.
"""

REGULAR_BEER_POINTS = 1  # Below 0.5 L
PINT_POINTS = 2  # Exactly 0.5 L


def beer_points(beer_count, pint_count):
    return (beer_count - pint_count) * REGULAR_BEER_POINTS + pint_count * PINT_POINTS
