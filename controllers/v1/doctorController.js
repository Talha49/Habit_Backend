const User = require('../../models/v1/User');
const UserLink = require('../../models/v1/UserLink');
const Habit = require('../../models/v1/Habit');

// Get list of linked patients
exports.getPatients = async (req, res) => {
    console.log('🩺 Get Patients API hit');
    try {
        const doctorId = req.user.id;

        // Check if user is actually a doctor (extra validation)
        if (req.user.role !== 'doctor') {
            return res.status(403).json({ success: false, error: 'Access denied. Doctor role required.' });
        }

        // Find active links where this user is the initiator (doctor)
        const links = await UserLink.find({
            initiator: doctorId,
            linkType: 'doctor-patient',
            status: 'active'
        }).populate('linkedUser', 'fullName email phone lastLoginAttempt isVerified');

        const patients = links.map(link => {
            if (!link.linkedUser) return null;
            return {
                id: link.linkedUser._id,
                fullName: link.linkedUser.fullName,
                email: link.linkedUser.email,
                phone: link.linkedUser.phone,
                linkedAt: link.acceptedAt,
                linkId: link._id
            };
        }).filter(p => p !== null);

        res.status(200).json({ success: true, data: patients });
    } catch (err) {
        console.error('❌ Get patients failed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get specific patient's habits and stats
exports.getPatientData = async (req, res) => {
    try {
        const doctorId = req.user.id;
        const { patientId } = req.params;

        // Verify Link exists and is active
        const link = await UserLink.findOne({
            initiator: doctorId,
            linkedUser: patientId,
            linkType: 'doctor-patient',
            status: 'active'
        });

        if (!link) {
            return res.status(404).json({ success: false, error: 'Patient not linked or link inactive' });
        }

        // Fetch Habits
        const habits = await Habit.find({ userId: patientId, isActive: true })
            .populate('categoryId', 'name color icon')
            .sort({ createdAt: -1 });

        // Basic Stats (mocked calculation for now, or real if simple)
        const totalHabits = habits.length;
        const totalCompletions = habits.reduce((acc, h) => acc + h.totalCompletions, 0);

        res.status(200).json({
            success: true,
            data: {
                patientId,
                habits,
                stats: {
                    totalHabits,
                    totalCompletions
                }
            }
        });

    } catch (err) {
        console.error('❌ Get patient data failed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};
