import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../shared/models/doctor_account.dart';
import '../../../../shared/utils/doctor_display_name.dart';
import '../../../../shared/widgets/gradient_app_bar.dart';
import '../../../auth/presentation/auth_controller.dart';
import '../data/doctor_profile_repository.dart';

class DoctorOwnProfileScreen extends ConsumerStatefulWidget {
  const DoctorOwnProfileScreen({super.key});

  @override
  ConsumerState<DoctorOwnProfileScreen> createState() => _DoctorProfileScreenState();
}

class _DoctorProfileScreenState extends ConsumerState<DoctorOwnProfileScreen> {
  final _controllers = <String, TextEditingController>{};
  bool _saving = false;
  bool _offersHomeVisit = true;
  bool _initialized = false;
  bool _locating = false;
  double? _lat;
  double? _lng;

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
      await ref.read(doctorProfileRepositoryProvider).update({
        'specialty': _controllers['specialty']?.text,
        'qualification': _controllers['qualification']?.text,
        'medRegNo': _controllers['medRegNo']?.text,
        'experience': _controllers['experience']?.text,
        'consultFee': _controllers['consultFee']?.text,
        'videoFee': _controllers['videoFee']?.text,
        'homeVisitFee': _controllers['homeVisitFee']?.text,
        'availability': _controllers['availability']?.text,
        'languages': _controllers['languages']?.text,
        'bio': _controllers['bio']?.text,
        'clinicName': _controllers['clinicName']?.text,
        'address': _controllers['address']?.text,
        'offersHomeVisit': _offersHomeVisit,
        if (_lat != null) 'lat': _lat,
        if (_lng != null) 'lng': _lng,
      });
      ref.invalidate(doctorAccountProvider);
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
          const SnackBar(content: Text('Location captured — tap "Save changes" to update your clinic location.')),
        );
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _uploadDoc(String type) async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (picked == null) return;
    try {
      await ref.read(doctorProfileRepositoryProvider).uploadDocument(type, File(picked.path));
      ref.invalidate(doctorAccountProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Uploaded.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final accountAsync = ref.watch(doctorAccountProvider);

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
          final p = account.doctorProfile;
          if (!_initialized) {
            _initialized = true;
            _offersHomeVisit = p?.offersHomeVisit ?? true;
            _lat = p?.lat;
            _lng = p?.lng;
          }
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              if (p != null && p.status != kDoctorStatusApproved) _StatusBanner(status: p.status),
              Center(
                child: CircleAvatar(
                  radius: 44,
                  backgroundImage: p?.photoUrl != null ? CachedNetworkImageProvider(p!.photoUrl!) : null,
                  child: p?.photoUrl == null ? Text(account.name.isNotEmpty ? account.name[0].toUpperCase() : '?') : null,
                ),
              ),
              const SizedBox(height: 8),
              Center(child: Text(doctorDisplayName(account.name), style: Theme.of(context).textTheme.titleLarge)),
              Center(child: Text(account.mobile, style: TextStyle(color: Colors.grey[600]))),
              const Divider(height: 32),
              _field('Specialty', 'specialty', p?.specialty),
              _field('Qualification', 'qualification', p?.qualification),
              _field('Medical registration no.', 'medRegNo', p?.medRegNo),
              _field('Experience (years)', 'experience', p?.experience.toString()),
              Row(
                children: [
                  Expanded(child: _field('Consult fee (₹)', 'consultFee', p?.consultFee.toString())),
                  const SizedBox(width: 12),
                  Expanded(child: _field('Home visit fee (₹)', 'homeVisitFee', p?.homeVisitFee.toString())),
                ],
              ),
              _field('Video fee (₹, for later)', 'videoFee', p?.videoFee.toString()),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Offer home visits'),
                value: _offersHomeVisit,
                onChanged: (v) => setState(() => _offersHomeVisit = v),
              ),
              _field('Availability', 'availability', p?.availability),
              _field('Languages', 'languages', p?.languages),
              _field('Bio', 'bio', p?.bio),
              _field('Clinic name', 'clinicName', p?.clinicName),
              _field('Clinic address', 'address', p?.address),
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _lat != null && _lng != null
                            ? 'Clinic location saved (${_lat!.toStringAsFixed(4)}, ${_lng!.toStringAsFixed(4)}) — used for nearby-doctor search.'
                            : 'No clinic location set yet — needed for nearby-doctor search.',
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
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Save changes'),
              ),
              const Divider(height: 32),
              Text('Verification documents', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              _docRow('Medical registration certificate', 'medRegCert', p?.medRegCertUrl),
              _docRow('Degree certificate', 'degreeCert', p?.degreeCertUrl),
              _docRow('KYC document', 'kyc', p?.kycDocUrl),
              _docRow('Clinic photo', 'clinicPhoto', p?.clinicPhotoUrl),
              if (p != null && !p.registrationFeePaid) ...[
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => context.push('/doctor/registration-payment'),
                  child: const Text('Pay registration fee'),
                ),
              ] else if (p != null) ...[
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: () => context.push('/doctor/subscription-payment'),
                  child: const Text('Manage subscription'),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _field(String label, String key, String? initial) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(controller: _c(key, initial), decoration: InputDecoration(labelText: label)),
    );
  }

  Widget _docRow(String label, String type, String? url) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(label),
      subtitle: Text(url != null ? 'Uploaded' : 'Not uploaded'),
      trailing: TextButton(onPressed: () => _uploadDoc(type), child: Text(url != null ? 'Replace' : 'Upload')),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (color, text) = switch (status) {
      kDoctorStatusPending => (Colors.orange, 'Your profile is pending admin verification.'),
      kDoctorStatusRejected => (Colors.red, 'Your application was rejected. Contact support for details.'),
      kDoctorStatusSuspended => (Colors.red, 'Your account is suspended. Contact support.'),
      _ => (Colors.grey, status),
    };
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
      child: Text(text, style: TextStyle(color: color)),
    );
  }
}
