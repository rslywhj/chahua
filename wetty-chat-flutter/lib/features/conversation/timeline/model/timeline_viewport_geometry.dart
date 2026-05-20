import 'dart:math' as math;

import 'package:chahua/features/conversation/timeline/model/message_visibility_window.dart';
import 'package:flutter/foundation.dart';

@immutable
class TimelineMessageGeometry {
  const TimelineMessageGeometry({
    required this.stableKey,
    required this.top,
    required this.bottom,
    this.messageId,
  });

  final String stableKey;
  final int? messageId;
  final double top;
  final double bottom;

  double get center => top + ((bottom - top) / 2);

  bool overlaps(double viewportTop, double viewportBottom) {
    final visibleTop = math.max(top, viewportTop);
    final visibleBottom = math.min(bottom, viewportBottom);
    return visibleBottom > visibleTop;
  }
}

@immutable
class TimelineViewportAnchor {
  const TimelineViewportAnchor({
    required this.stableKey,
    required this.viewportDy,
    this.messageId,
  });

  final String stableKey;
  final int? messageId;
  final double viewportDy;
}

double resolveTimelineTopPreferredAnchorAlignment({
  required double afterExtent,
  required double viewportExtent,
}) {
  if (viewportExtent <= 0) {
    return 0;
  }
  final visibleFractionBelowAnchor = (afterExtent / viewportExtent).clamp(
    0.0,
    1.0,
  );
  return 1.0 - visibleFractionBelowAnchor;
}

MessageVisibilityWindow? resolveTimelineMessageVisibilityWindow({
  required Iterable<TimelineMessageGeometry> measurements,
  required double viewportTop,
  required double viewportBottom,
}) {
  final visible = <({int messageId, double top})>[];
  for (final measurement in measurements) {
    final messageId = measurement.messageId;
    if (messageId == null) {
      continue;
    }
    final visibleTop = measurement.top.clamp(viewportTop, viewportBottom);
    final visibleBottom = measurement.bottom.clamp(viewportTop, viewportBottom);
    if (visibleBottom <= visibleTop) {
      continue;
    }
    visible.add((messageId: messageId, top: visibleTop));
  }
  if (visible.isEmpty) {
    return null;
  }
  visible.sort((a, b) => a.top.compareTo(b.top));
  return MessageVisibilityWindow(
    firstVisibleMessageId: visible.first.messageId,
    lastVisibleMessageId: visible.last.messageId,
  );
}

TimelineViewportAnchor? resolveTimelineViewportAnchor({
  required Iterable<TimelineMessageGeometry> measurements,
  required double viewportTop,
  required double viewportBottom,
}) {
  TimelineMessageGeometry? bestMeasurement;
  double? bestDistanceFromCenter;
  final viewportCenter = viewportTop + ((viewportBottom - viewportTop) / 2);

  for (final measurement in measurements) {
    if (!measurement.overlaps(viewportTop, viewportBottom)) {
      continue;
    }
    final distanceFromCenter = (measurement.center - viewportCenter).abs();
    final previousDistance = bestDistanceFromCenter;
    if (previousDistance == null ||
        distanceFromCenter < previousDistance ||
        (distanceFromCenter == previousDistance &&
            measurement.top < bestMeasurement!.top)) {
      bestMeasurement = measurement;
      bestDistanceFromCenter = distanceFromCenter;
    }
  }

  if (bestMeasurement == null) {
    return null;
  }

  return TimelineViewportAnchor(
    stableKey: bestMeasurement.stableKey,
    messageId: bestMeasurement.messageId,
    viewportDy: bestMeasurement.top - viewportTop,
  );
}

double resolveTimelineAnchorCorrectionDelta({
  required double previousViewportDy,
  required double currentViewportDy,
}) {
  return currentViewportDy - previousViewportDy;
}

double resolveTimelineAnchorCorrectedOffset({
  required double currentScrollOffset,
  required double previousViewportDy,
  required double currentViewportDy,
}) {
  return currentScrollOffset +
      resolveTimelineAnchorCorrectionDelta(
        previousViewportDy: previousViewportDy,
        currentViewportDy: currentViewportDy,
      );
}
