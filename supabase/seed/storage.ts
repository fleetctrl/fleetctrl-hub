import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY) environment variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    const bucketName = 'internal';

    console.log(`Checking if bucket '${bucketName}' exists...`);

    const { data: bucket, error: getError } = await supabase.storage.getBucket(bucketName);

    if (getError) {
        // If error implies not found, we create it.
        // The error message for not found varies, but typically we can just try to create it if get fails
        // or specifically check for "not found".
        // However, simplest is to try creating it if it doesn't exist.
        console.log(`Bucket '${bucketName}' not found or inaccessible (Error: ${getError.message}). Attempting to create...`);

        const { data, error: createError } = await supabase.storage.createBucket(bucketName, {
            public: false,
            fileSizeLimit: null, // Optional: set limit
            allowedMimeTypes: null // Optional: set allowed types
        });

        if (createError) {
            // If it failed because it already exists (race condition or misleading getError), handle it.
            if (createError.message.includes('already exists')) {
                console.log(`Bucket '${bucketName}' already exists.`);
            } else {
                console.error(`Failed to create bucket '${bucketName}':`, createError);
                process.exit(1);
            }
        } else {
            console.log(`Bucket '${bucketName}' created successfully.`);
        }
    } else {
        console.log(`Bucket '${bucketName}' already exists.`);
    }
}

main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
