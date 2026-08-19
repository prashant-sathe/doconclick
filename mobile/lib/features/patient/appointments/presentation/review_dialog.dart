import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/patient_appointments_repository.dart';

Future<void> showReviewDialog(BuildContext context, WidgetRef ref, {required String appointmentId}) {
  return showDialog(
    context: context,
    builder: (context) => _ReviewDialog(appointmentId: appointmentId, ref: ref),
  );
}

class _ReviewDialog extends StatefulWidget {
  const _ReviewDialog({required this.appointmentId, required this.ref});
  final String appointmentId;
  final WidgetRef ref;

  @override
  State<_ReviewDialog> createState() => _ReviewDialogState();
}

class _ReviewDialogState extends State<_ReviewDialog> {
  int _rating = 5;
  final _commentController = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      await widget.ref.read(patientAppointmentsRepositoryProvider).leaveReview(
            appointmentId: widget.appointmentId,
            rating: _rating,
            comment: _commentController.text.trim().isEmpty ? null : _commentController.text.trim(),
          );
      widget.ref.invalidate(appointmentPollingProvider(widget.appointmentId));
      if (mounted) Navigator.of(context).pop();
    } on AppointmentApiError catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Rate your consultation'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final star = i + 1;
              return IconButton(
                onPressed: () => setState(() => _rating = star),
                icon: Icon(star <= _rating ? Icons.star_rounded : Icons.star_outline_rounded, color: Colors.amber[700], size: 32),
              );
            }),
          ),
          TextField(
            controller: _commentController,
            decoration: const InputDecoration(labelText: 'Comment (optional)'),
            maxLines: 3,
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: _submitting ? null : _submit,
          child: _submitting
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Submit'),
        ),
      ],
    );
  }
}
