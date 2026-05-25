import 'dart:ui';

import 'package:chahua/features/conversation/timeline/model/message_long_press_details_v2.dart';
import 'package:chahua/features/shared/model/message/message.dart';
import 'package:flutter/cupertino.dart';

import 'message_overlay_action_v2.dart';
import 'message_overlay_bubble_v2.dart';
import 'message_overlay_controls_v2.dart';
import 'message_overlay_layout_v2.dart';
import 'message_overlay_reaction_picker_v2.dart';

class MessageOverlayV2 extends StatefulWidget {
  const MessageOverlayV2({
    super.key,
    required this.details,
    required this.visible,
    required this.actions,
    required this.quickReactionEmojis,
    required this.onDismiss,
    required this.onToggleReaction,
  });

  final MessageLongPressDetailsV2 details;
  final bool visible;
  final List<MessageOverlayActionV2> actions;
  final List<String> quickReactionEmojis;
  final VoidCallback onDismiss;
  final ValueChanged<String> onToggleReaction;

  @override
  State<MessageOverlayV2> createState() => _MessageOverlayV2State();
}

class _MessageOverlayV2State extends State<MessageOverlayV2> {
  bool _reactionPickerExpanded = false;

  bool get _showReactionBar =>
      !widget.details.message.isDeleted &&
      widget.details.message.content is! StickerMessageContent;

  @override
  void didUpdateWidget(covariant MessageOverlayV2 oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.details.message.stableKey !=
        widget.details.message.stableKey) {
      _reactionPickerExpanded = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final layout = MessageOverlayLayoutV2.calculate(
          viewportSize: constraints.biggest,
          mediaPadding: MediaQuery.paddingOf(context),
          sourceBubbleRect: widget.details.bubbleRect,
          isMe: widget.details.isMe,
          actionCount: widget.actions.length,
          showReactionBar: _showReactionBar,
          reactionPickerExpanded: _reactionPickerExpanded,
        );

        return Stack(
          clipBehavior: Clip.hardEdge,
          children: [
            Positioned.fill(
              child: _OverlayBackdrop(
                visible: widget.visible,
                onDismiss: widget.onDismiss,
              ),
            ),
            Positioned.fromRect(
              rect: layout.bubbleRect,
              child: _AnimatedOverlayChild(
                visible: widget.visible,
                duration: const Duration(milliseconds: 160),
                alignment: widget.details.isMe
                    ? Alignment.centerRight
                    : Alignment.centerLeft,
                child: ClipRect(
                  child: OverflowBox(
                    alignment: widget.details.isMe
                        ? Alignment.topRight
                        : Alignment.topLeft,
                    minWidth: layout.bubbleRect.width,
                    maxWidth: layout.bubbleRect.width,
                    maxHeight: widget.details.bubbleRect.height,
                    child: MessageOverlayBubbleV2(details: widget.details),
                  ),
                ),
              ),
            ),
            Positioned.fromRect(
              rect: layout.actionPanelRect,
              child: _AnimatedOverlayChild(
                visible: widget.visible,
                duration: const Duration(milliseconds: 180),
                alignment: _alignmentFor(
                  widget.details.isMe,
                  layout.actionPanelSide,
                ),
                child: MessageOverlayActionPanelV2(actions: widget.actions),
              ),
            ),
            if (_showReactionBar)
              if (layout.reactionBarRect case final rect?)
                _AnimatedPositionedFromRect(
                  rect: rect,
                  duration: const Duration(milliseconds: 180),
                  child: _AnimatedOverlayChild(
                    visible: widget.visible,
                    duration: const Duration(milliseconds: 160),
                    alignment: _alignmentFor(
                      widget.details.isMe,
                      layout.reactionBarSide,
                    ),
                    child: MessageOverlayReactionBarV2(
                      emojis: widget.quickReactionEmojis,
                      onToggleReaction: widget.onToggleReaction,
                      onExpandedChanged: (expanded) {
                        setState(() {
                          _reactionPickerExpanded = expanded;
                        });
                      },
                    ),
                  ),
                ),
          ],
        );
      },
    );
  }

  Alignment _alignmentFor(bool isMe, MessageOverlaySideV2? side) {
    return switch ((isMe, side)) {
      (true, MessageOverlaySideV2.above) => Alignment.bottomRight,
      (true, MessageOverlaySideV2.below) => Alignment.topRight,
      (false, MessageOverlaySideV2.above) => Alignment.bottomLeft,
      (false, MessageOverlaySideV2.below) => Alignment.topLeft,
      (true, null) => Alignment.centerRight,
      (false, null) => Alignment.centerLeft,
    };
  }
}

class _AnimatedPositionedFromRect extends StatelessWidget {
  const _AnimatedPositionedFromRect({
    required this.rect,
    required this.duration,
    required this.child,
  });

  final Rect rect;
  final Duration duration;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedPositioned(
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      duration: duration,
      curve: Curves.easeOutCubic,
      child: ClipRect(child: child),
    );
  }
}

class _OverlayBackdrop extends StatelessWidget {
  const _OverlayBackdrop({required this.visible, required this.onDismiss});

  final bool visible;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      ignoring: !visible,
      child: TweenAnimationBuilder<double>(
        tween: Tween<double>(begin: 0, end: visible ? 1 : 0),
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOutCubic,
        builder: (context, value, child) =>
            Opacity(opacity: value, child: child),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onDismiss,
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
            child: ColoredBox(color: CupertinoColors.black.withAlpha(56)),
          ),
        ),
      ),
    );
  }
}

class _AnimatedOverlayChild extends StatelessWidget {
  const _AnimatedOverlayChild({
    required this.visible,
    required this.duration,
    required this.alignment,
    required this.child,
  });

  final bool visible;
  final Duration duration;
  final Alignment alignment;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      ignoring: !visible,
      child: TweenAnimationBuilder<double>(
        tween: Tween<double>(begin: 0, end: visible ? 1 : 0),
        duration: duration,
        curve: Curves.easeOutCubic,
        builder: (context, value, child) => Opacity(
          opacity: value,
          child: Transform.scale(
            scale: 0.96 + (0.04 * value),
            alignment: alignment,
            child: child,
          ),
        ),
        child: child,
      ),
    );
  }
}
