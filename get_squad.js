const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const SquadSchema = new mongoose.Schema({
    name: String,
    inviteCode: String
}, { strict: false });

const Squad = mongoose.model('SquadV1', SquadSchema, 'squadv1s'); // Or just query the generic collection

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        // Let's query using the exact model name. Usually mongoose pluralizes it to 'squadv1s'
        // If unsure, we can list collections or use the actual model file.
        const actualSquadModel = require('./models/v1/Squad');

        const squads = await actualSquadModel.find({ name: { $regex: /brainiac/i } });
        console.log(JSON.stringify(squads, null, 2));

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
