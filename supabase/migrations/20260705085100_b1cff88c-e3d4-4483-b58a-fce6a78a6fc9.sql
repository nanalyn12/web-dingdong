UPDATE auth.users
SET encrypted_password = crypt('dingdong1214', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email = 'admin@dingdong.local';