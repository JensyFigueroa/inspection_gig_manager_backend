const User = require('../models/User');
const bcrypt = require('bcryptjs');

module.exports = async function createDefaultAdminUser() { 
    const adminEmail = 'admin@example.com';
    
    try {
        const adminUser = await User.findOne({ email: adminEmail });

        if (!adminUser) {
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'P@ssw0rd', 10);
            const admin = new User({
                fullName: 'Admin User',
                email: adminEmail,
                password: hashedPassword,
                role: 'admin'
            });
            await admin.save();
            console.log('✅ Default admin user created');
        } else {
            console.log('✅ Default admin user already exists');
        }
    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
    }
} 