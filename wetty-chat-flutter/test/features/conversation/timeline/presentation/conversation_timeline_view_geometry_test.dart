import 'package:chahua/features/conversation/timeline/model/timeline_viewport_geometry.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('resolveTimelineTopPreferredAnchorAlignment', () {
    test('returns 0 when viewport has no extent', () {
      expect(
        resolveTimelineTopPreferredAnchorAlignment(
          afterExtent: 100,
          viewportExtent: 0,
        ),
        0,
      );
    });

    test('places seam lower when after content is shorter than viewport', () {
      expect(
        resolveTimelineTopPreferredAnchorAlignment(
          afterExtent: 150,
          viewportExtent: 600,
        ),
        closeTo(0.75, 0.001),
      );
    });

    test('places seam at top when after content fills the viewport', () {
      expect(
        resolveTimelineTopPreferredAnchorAlignment(
          afterExtent: 600,
          viewportExtent: 600,
        ),
        0,
      );
    });

    test('clamps overfull after content to top placement', () {
      expect(
        resolveTimelineTopPreferredAnchorAlignment(
          afterExtent: 900,
          viewportExtent: 600,
        ),
        0,
      );
    });
  });

  group('resolveTimelineMessageVisibilityWindow', () {
    test('ignores rows without server ids and rows outside the viewport', () {
      final window = resolveTimelineMessageVisibilityWindow(
        viewportTop: 100,
        viewportBottom: 300,
        measurements: const [
          TimelineMessageGeometry(
            stableKey: 'client:local',
            top: 110,
            bottom: 150,
          ),
          TimelineMessageGeometry(
            stableKey: 'server:1',
            messageId: 1,
            top: 10,
            bottom: 90,
          ),
          TimelineMessageGeometry(
            stableKey: 'server:2',
            messageId: 2,
            top: 120,
            bottom: 180,
          ),
          TimelineMessageGeometry(
            stableKey: 'server:3',
            messageId: 3,
            top: 260,
            bottom: 360,
          ),
        ],
      );

      expect(window?.firstVisibleMessageId, 2);
      expect(window?.lastVisibleMessageId, 3);
    });

    test('returns null when no server-backed row intersects the viewport', () {
      final window = resolveTimelineMessageVisibilityWindow(
        viewportTop: 100,
        viewportBottom: 300,
        measurements: const [
          TimelineMessageGeometry(
            stableKey: 'server:1',
            messageId: 1,
            top: 10,
            bottom: 90,
          ),
          TimelineMessageGeometry(
            stableKey: 'client:local',
            top: 120,
            bottom: 180,
          ),
        ],
      );

      expect(window, isNull);
    });

    test('orders visible rows by clipped top edge', () {
      final window = resolveTimelineMessageVisibilityWindow(
        viewportTop: 100,
        viewportBottom: 300,
        measurements: const [
          TimelineMessageGeometry(
            stableKey: 'server:5',
            messageId: 5,
            top: 250,
            bottom: 310,
          ),
          TimelineMessageGeometry(
            stableKey: 'server:4',
            messageId: 4,
            top: 90,
            bottom: 140,
          ),
        ],
      );

      expect(window?.firstVisibleMessageId, 4);
      expect(window?.lastVisibleMessageId, 5);
    });
  });

  group('resolveTimelineViewportAnchor', () {
    test('chooses the visible row closest to the viewport center', () {
      final anchor = resolveTimelineViewportAnchor(
        viewportTop: 100,
        viewportBottom: 500,
        measurements: const [
          TimelineMessageGeometry(
            stableKey: 'server:1',
            messageId: 1,
            top: 120,
            bottom: 180,
          ),
          TimelineMessageGeometry(
            stableKey: 'server:2',
            messageId: 2,
            top: 260,
            bottom: 340,
          ),
          TimelineMessageGeometry(
            stableKey: 'server:3',
            messageId: 3,
            top: 430,
            bottom: 520,
          ),
        ],
      );

      expect(anchor?.stableKey, 'server:2');
      expect(anchor?.messageId, 2);
      expect(anchor?.viewportDy, 160);
    });

    test(
      'uses the earlier row as a deterministic center-distance tiebreaker',
      () {
        final anchor = resolveTimelineViewportAnchor(
          viewportTop: 0,
          viewportBottom: 400,
          measurements: const [
            TimelineMessageGeometry(
              stableKey: 'server:lower',
              messageId: 2,
              top: 260,
              bottom: 340,
            ),
            TimelineMessageGeometry(
              stableKey: 'server:upper',
              messageId: 1,
              top: 60,
              bottom: 140,
            ),
          ],
        );

        expect(anchor?.stableKey, 'server:upper');
        expect(anchor?.viewportDy, 60);
      },
    );

    test('returns null when no row overlaps the viewport', () {
      expect(
        resolveTimelineViewportAnchor(
          viewportTop: 100,
          viewportBottom: 300,
          measurements: const [
            TimelineMessageGeometry(
              stableKey: 'server:1',
              messageId: 1,
              top: 10,
              bottom: 90,
            ),
          ],
        ),
        isNull,
      );
    });
  });

  group('resolveTimelineAnchorCorrectedOffset', () {
    test(
      'increases scroll offset when the anchor moved lower in the viewport',
      () {
        expect(
          resolveTimelineAnchorCorrectedOffset(
            currentScrollOffset: 400,
            previousViewportDy: 180,
            currentViewportDy: 230,
          ),
          450,
        );
      },
    );

    test(
      'decreases scroll offset when the anchor moved higher in the viewport',
      () {
        expect(
          resolveTimelineAnchorCorrectedOffset(
            currentScrollOffset: 400,
            previousViewportDy: 180,
            currentViewportDy: 120,
          ),
          340,
        );
      },
    );
  });
}
