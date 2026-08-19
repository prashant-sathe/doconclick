import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../shared/widgets/gradient_app_bar.dart';
import '../../../auth/presentation/auth_controller.dart';
import '../data/patient_profile_repository.dart';

class PatientProfileScreen extends ConsumerStatefulWidget {
  const PatientProfileScreen({super.key});

  @override
  ConsumerState<PatientProfileScreen> createState() => _PatientProfileScreenState();
}

class _PatientProfileScreenState extends ConsumerState<PatientProfileScreen> {
  final _controllers = <String, TextEditingController>{};
  bool _saving = false;
  bool _uploadingPhoto = false;
  bool _locating = false;
  double? _lat;
  double? _lng;
  bool _locationInitialized = false;

  TextEditingController _c(String key, String? initial) {
    return _controllers.putIfAbsent(key, () => TextEditingController(text: initial ?? ''));
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ref.read(patientProfileRepositoryProvider).update({
        'homeAddress': _controllers['homeAddress']?.text,
        'landmark': _controllers['landmark']?.text,
        'pinCode': _controllers['pinCode']?.text,
        'bloodGroup': _controllers['bloodGroup']?.text,
        'height': _controllers['height']?.text,
        'weight': _controllers['weight']?.text,
        'allergies': _controllers['allergies']?.text,
        'chronicDiseases': _controllers['chronicDiseases']?.text,
        'medications': _controllers['medications']?.text,
        'surgeries': _controllers['surgeries']?.text,
        'emergencyContactName': _controllers['emergencyContactName']?.text,
        'emergencyContactPhone': _controllers['emergencyContactPhone']?.text,
        if (_lat != null) 'lat': _lat,
        if (_lng != null) 'lng': _lng,
      });
      ref.invalidate(patientAccountProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile updated.')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _useCurrentLocation() async {
    setState(() => _locating = true);
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) throw Exception('Location services are off.');
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        throw Exception('Location permission denied.');
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium),
      );
      setState(() {
        _lat = position.latitude;
        _lng = position.longitude;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Location captured — tap "Save changes" to update your address.')),
        );
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _pickPhoto() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (picked == null) return;
    setState(() => _uploadingPhoto = true);
    try {
      await ref.read(patientProfileRepositoryProvider).uploadPhoto(File(picked.path));
      ref.invalidate(patientAccountProvider);
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final accountAsync = ref.watch(patientAccountProvider);

    return Scaffold(
      appBar: GradientAppBar(
        title: 'My profile',
        actions: [
          IconButton(icon: const Icon(Icons.logout), onPressed: () => ref.read(authControllerProvider.notifier).logout()),
        ],
      ),
      body: accountAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (account) {
          final p = account.patientProfile;
          if (!_locationInitialized) {
            _locationInitialized = true;
            _lat = p?.lat;
            _lng = p?.lng;
          }
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Center(
                child: Stack(
                  children: [
                    CircleAvatar(
                      radius: 44,
                      backgroundImage: p?.photoUrl != null ? CachedNetworkImageProvider(p!.photoUrl!) : null,
                      child: p?.photoUrl == null ? Text(account.name.isNotEmpty ? account.name[0].toUpperCase() : '?') : null,
                    ),
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: InkWell(
                        onTap: _uploadingPhoto ? null : _pickPhoto,
                        child: CircleAvatar(
                          radius: 16,
                          backgroundColor: Theme.of(context).colorScheme.primary,
                          child: _uploadingPhoto
                              ? const Padding(
                                  padding: EdgeInsets.all(3),
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Icon(Icons.camera_alt, size: 16, color: Colors.white),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Center(child: Text(account.name, style: Theme.of(context).textTheme.titleLarge)),
              Center(child: Text(account.mobile, style: TextStyle(color: Colors.grey[600]))),
              const SizedBox(height: 8),
              Center(
                child: OutlinedButton.icon(
                  onPressed: () => context.push('/patient/dependents'),
                  icon: const Icon(Icons.family_restroom_outlined),
                  label: const Text('Manage family members'),
                ),
              ),
              const Divider(height: 32),
              Text('Medical info', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              _field('Home address', 'homeAddress', p?.homeAddress),
              _field('Landmark', 'landmark', p?.landmark),
              _field('PIN code', 'pinCode', p?.pinCode),
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _lat != null && _lng != null
                            ? 'Location saved (${_lat!.toStringAsFixed(4)}, ${_lng!.toStringAsFixed(4)}) — used for nearby-doctor search and home visits.'
                            : 'No location set yet — needed for nearby-doctor search and home visits.',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: _locating ? null : _useCurrentLocation,
                      icon: _locating
                          ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.my_location, size: 16),
                      label: const Text('Use current'),
                    ),
                  ],
                ),
              ),
              _field('Blood group', 'bloodGroup', p?.bloodGroup),
              Row(
                children: [
                  Expanded(child: _field('Height (cm)', 'height', p?.height?.toString())),
                  const SizedBox(width: 12),
                  Expanded(child: _field('Weight (kg)', 'weight', p?.weight?.toString())),
                ],
              ),
              _field('Allergies', 'allergies', p?.allergies),
              _field('Chronic diseases', 'chronicDiseases', p?.chronicDiseases),
              _field('Current medications', 'medications', p?.medications),
              _field('Past surgeries', 'surgeries', p?.surgeries),
              _field('Emergency contact name', 'emergencyContactName', p?.emergencyContactName),
              _field('Emergency contact phone', 'emergencyContactPhone', p?.emergencyContactPhone),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Save changes'),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _field(String label, String key, String? initial) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: _c(key, initial),
        decoration: InputDecoration(labelText: label),
      ),
    );
  }
}
