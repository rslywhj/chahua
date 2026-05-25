import 'package:chahua/app/theme/style_config.dart';
import 'package:chahua/l10n/app_localizations.dart';
import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show Colors, Material;

import 'message_overlay_metrics_v2.dart';

class MessageOverlayReactionBarV2 extends StatefulWidget {
  const MessageOverlayReactionBarV2({
    super.key,
    required this.emojis,
    required this.onToggleReaction,
    this.onExpandedChanged,
  });

  final List<String> emojis;
  final ValueChanged<String> onToggleReaction;
  final ValueChanged<bool>? onExpandedChanged;

  @override
  State<MessageOverlayReactionBarV2> createState() =>
      _MessageOverlayReactionBarV2State();
}

class _MessageOverlayReactionBarV2State
    extends State<MessageOverlayReactionBarV2>
    with TickerProviderStateMixin {
  bool _expanded = false;

  void _expand() {
    if (_expanded) {
      return;
    }
    setState(() {
      _expanded = true;
    });
    widget.onExpandedChanged?.call(true);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return AnimatedSize(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      alignment: Alignment.topCenter,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: colors.backgroundSecondary,
          borderRadius: BorderRadius.circular(_expanded ? 24 : 999),
          boxShadow: _expanded
              ? null
              : const [
                  BoxShadow(
                    blurRadius: 18,
                    offset: Offset(0, 6),
                    color: Color(0x22000000),
                  ),
                ],
        ),
        child: _expanded
            ? _ExpandedReactionPickerReveal(
                child: _NativeEmojiPicker(
                  key: const ValueKey(
                    'message-overlay-expanded-reaction-picker',
                  ),
                  onEmojiSelected: widget.onToggleReaction,
                ),
              )
            : _CollapsedReactionRow(
                emojis: widget.emojis,
                onToggleReaction: widget.onToggleReaction,
                onExpand: _expand,
              ),
      ),
    );
  }
}

class _CollapsedReactionRow extends StatelessWidget {
  const _CollapsedReactionRow({
    required this.emojis,
    required this.onToggleReaction,
    required this.onExpand,
  });

  final List<String> emojis;
  final ValueChanged<String> onToggleReaction;
  final VoidCallback onExpand;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        for (final emoji in emojis)
          CupertinoButton(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            minimumSize: const Size(0, 0),
            onPressed: () => onToggleReaction(emoji),
            child: Text(emoji, style: const TextStyle(fontSize: 24, height: 1)),
          ),
        CupertinoButton(
          padding: const EdgeInsets.all(4),
          minimumSize: const Size(0, 0),
          onPressed: onExpand,
          child: Icon(CupertinoIcons.add, size: 22, color: colors.textPrimary),
        ),
      ],
    );
  }
}

class _ExpandedReactionPickerReveal extends StatelessWidget {
  const _ExpandedReactionPickerReveal({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        return Opacity(
          key: const ValueKey('message-overlay-expanded-picker-opacity'),
          opacity: value,
          child: Transform.scale(
            scale: 0.96 + (0.04 * value),
            alignment: Alignment.topCenter,
            child: child,
          ),
        );
      },
      child: child,
    );
  }
}

class _NativeEmojiPicker extends StatelessWidget {
  const _NativeEmojiPicker({super.key, required this.onEmojiSelected});

  final ValueChanged<String> onEmojiSelected;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final l10n = AppLocalizations.of(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: Material(
        color: colors.backgroundSecondary,
        child: EmojiPicker(
          onEmojiSelected: (_, emoji) => onEmojiSelected(emoji.emoji),
          config: Config(
            height: MessageOverlayMetricsV2.reactionPickerExpandedHeight - 12,
            checkPlatformCompatibility: false,
            emojiViewConfig: EmojiViewConfig(
              columns: 8,
              emojiSizeMax: 24,
              backgroundColor: colors.backgroundSecondary,
              buttonMode: ButtonMode.CUPERTINO,
              noRecents: Text(
                l10n?.reactionPickerNoRecents ?? '',
                style: appTextStyle(
                  context,
                  color: colors.textSecondary,
                  fontSize: 20,
                ),
                textAlign: TextAlign.center,
              ),
            ),
            categoryViewConfig: CategoryViewConfig(
              backgroundColor: colors.backgroundSecondary,
              indicatorColor: colors.accentPrimary,
              iconColor: colors.textSecondary,
              iconColorSelected: colors.accentPrimary,
              backspaceColor: colors.textSecondary,
              dividerColor: Colors.transparent,
            ),
            bottomActionBarConfig: const BottomActionBarConfig(enabled: false),
            searchViewConfig: SearchViewConfig(
              backgroundColor: colors.backgroundSecondary,
              buttonIconColor: colors.textSecondary,
              hintText: l10n?.messageSearchAction,
              inputTextStyle: appBodyTextStyle(context),
              hintTextStyle: appBodyTextStyle(
                context,
                color: colors.textSecondary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
