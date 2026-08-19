import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../shared/widgets/gradient_app_bar.dart';
import '../data/dependents_repository.dart';
import '../domain/patient_dependent.dart';

IconData _relationIcon(String relation) {
  switch (relation.toLowerCase()) {
    case 'spouse':
      return Icons.favorite_rounded;
    case 'son':
    case 'daughter':
    case 'child':
      return Icons.child_care_rounded;
    case 'father':
    case 'mother':
    case 'parent':
      return Icons.elderly_rounded;
    default:
      return Icons.person_rounded;
  }
}

class DependentsScreen extends ConsumerWidget {
  const DependentsScreen({super.key});

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref, PatientDependent dependent) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Remove ${dependent.name}?'),
        content: const Text('Their past appointment history will be kept, but they won\'t be selectable for new bookings.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Remove')),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(dependentsRepositoryProvider).delete(dependent.id);
      ref.invalidate(dependentsListProvider);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dependentsAsync = ref.watch(dependentsListProvider);

    return Scaffold(
      appBar: const GradientAppBar(title: 'Family members'),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddDependentSheet(context, ref),
        child: const Icon(Icons.add),
      ),
      body: dependentsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (dependents) {
          if (dependents.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.groups_2_outlined, size: 56, color: Colors.grey[350]),
                  const SizedBox(height: 12),
                  Text('No family members added yet', style: TextStyle(color: Colors.grey[600], fontSize: 16)),
                  const SizedBox(height: 4),
                  Text('Tap + to add one.', style: TextStyle(color: Colors.grey[400], fontSize: 13)),
                ],
              ),
            ).animate().fadeIn(duration: 300.ms);
          }
          final scheme = Theme.of(context).colorScheme;
          return ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
            itemCount: dependents.length,
            itemBuilder: (context, i) {
              final d = dependents[i];
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  leading: CircleAvatar(
                    radius: 22,
                    backgroundColor: scheme.primaryContainer,
                    child: Icon(_relationIcon(d.relation), color: scheme.primary),
                  ),
                  title: Text(d.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text([d.relation, if (d.age != null) '${d.age} yrs', if (d.gender != null) d.gender].join(' · ')),
                  trailing: IconButton(
                    icon: Icon(Icons.delete_outline, color: Colors.red[300]),
                    onPressed: () => _confirmDelete(context, ref, d),
                  ),
                ),
              ).animate().fadeIn(delay: (i.clamp(0, 8) * 40).ms, duration: 280.ms).slideY(begin: 0.08, end: 0, curve: Curves.easeOut);
            },
          );
        },
      ),
    );
  }

  void _showAddDependentSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) => const _AddDependentForm(),
    );
  }
}

class _AddDependentForm extends ConsumerStatefulWidget {
  const _AddDependentForm();

  @override
  ConsumerState<_AddDependentForm> createState() => _AddDependentFormState();
}

class _AddDependentFormState extends ConsumerState<_AddDependentForm> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _ageController = TextEditingController();
  String _relation = kDependentRelations.first;
  String? _gender;
  bool _submitting = false;

  @override
  void dispose() {
    _nameController.dispose();
    _ageController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      await ref.read(dependentsRepositoryProvider).create({
        'name': _nameController.text.trim(),
        'relation': _relation,
        'age': _ageController.text.trim(),
        'gender': _gender,
      });
      ref.invalidate(dependentsListProvider);
      if (mounted) Navigator.of(context).pop();
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Add family member', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: 'Name'),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _relation,
              decoration: const InputDecoration(labelText: 'Relation'),
              items: [for (final r in kDependentRelations) DropdownMenuItem(value: r, child: Text(r))],
              onChanged: (v) => setState(() => _relation = v ?? _relation),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _ageController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Age (optional)'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String?>(
                    initialValue: _gender,
                    decoration: const InputDecoration(labelText: 'Gender'),
                    items: const [
                      DropdownMenuItem(value: 'Male', child: Text('Male')),
                      DropdownMenuItem(value: 'Female', child: Text('Female')),
                      DropdownMenuItem(value: 'Other', child: Text('Other')),
                    ],
                    onChanged: (v) => setState(() => _gender = v),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
