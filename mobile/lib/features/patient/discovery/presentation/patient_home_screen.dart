import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart' as ll;

import '../../../../core/location/location_provider.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../../../auth/presentation/auth_controller.dart';
import '../data/doctor_repository.dart';
import 'doctor_list_card.dart';
import 'doctor_map_view.dart';
import 'emergency_sos_sheet.dart';

enum _ViewMode { list, map }

class PatientHomeScreen extends ConsumerStatefulWidget {
  const PatientHomeScreen({super.key});

  @override
  ConsumerState<PatientHomeScreen> createState() => _PatientHomeScreenState();
}

class _PatientHomeScreenState extends ConsumerState<PatientHomeScreen> {
  _ViewMode _mode = _ViewMode.list;
  String? _specialty;
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final doctorsAsync = ref.watch(doctorListProvider(specialty: _specialty));
    final specialtiesAsync = ref.watch(specialtyListProvider);
    final positionAsync = ref.watch(currentPositionProvider);
    final user = ref.watch(authControllerProvider).value;
    final firstName = (user?.name ?? '').split(' ').first;

    return Scaffold(
      appBar: GradientAppBar(
        title: firstName.isEmpty ? 'Find a doctor' : 'Hi, $firstName 👋',
        actions: [
          IconButton(
            icon: const Icon(Icons.event_note_outlined),
            tooltip: 'My appointments',
            onPressed: () => context.push('/patient/appointments'),
          ),
          IconButton(
            icon: const Icon(Icons.person_outline),
            tooltip: 'My profile',
            onPressed: () => context.push('/patient/profile'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      floatingActionButton: doctorsAsync.maybeWhen(
        data: (doctors) => FloatingActionButton.extended(
          backgroundColor: Colors.red,
          onPressed: () => showEmergencySosSheet(context, ref, doctors: doctors),
          icon: const Icon(Icons.emergency_rounded),
          label: const Text('SOS'),
        ),
        orElse: () => null,
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search doctors by name',
                prefixIcon: const Icon(Icons.search),
                filled: true,
              ),
              onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
            ),
          ),
          specialtiesAsync.maybeWhen(
            data: (specialties) => SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(label: const Text('All'), selected: _specialty == null, onSelected: (_) => setState(() => _specialty = null)),
                  ),
                  for (final s in specialties)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(s.name),
                        selected: _specialty == s.name,
                        onSelected: (_) => setState(() => _specialty = s.name),
                      ),
                    ),
                ],
              ),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Align(
              alignment: Alignment.centerRight,
              child: SegmentedButton<_ViewMode>(
                segments: const [
                  ButtonSegment(value: _ViewMode.list, icon: Icon(Icons.list_rounded), label: Text('List')),
                  ButtonSegment(value: _ViewMode.map, icon: Icon(Icons.map_outlined), label: Text('Map')),
                ],
                selected: {_mode},
                onSelectionChanged: (s) => setState(() => _mode = s.first),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: doctorsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Could not load doctors.\n$e', textAlign: TextAlign.center)),
              data: (doctors) {
                final filtered = _search.isEmpty
                    ? doctors
                    : doctors.where((d) => d.name.toLowerCase().contains(_search)).toList();

                if (filtered.isEmpty) {
                  return const Center(child: Text('No doctors found. Try a different search or specialty.'));
                }

                if (_mode == _ViewMode.map) {
                  final userLoc = positionAsync.value;
                  return DoctorMapView(
                    doctors: filtered,
                    userLocation: userLoc != null ? ll.LatLng(userLoc.latitude, userLoc.longitude) : null,
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.only(bottom: 90, top: 4),
                  itemCount: filtered.length,
                  itemBuilder: (context, i) {
                    final d = filtered[i];
                    return DoctorListCard(
                      doctor: d,
                      index: i,
                      onTap: () => context.push('/patient/doctor/${d.id}'),
                      onBook: () => context.push('/patient/book?doctorId=${d.id}'),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
