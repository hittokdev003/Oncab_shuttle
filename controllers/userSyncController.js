'use strict';

const { QueryTypes } = require('sequelize');
const jwt = require('jsonwebtoken');
const sequelize = require('../config/database');
const { CustomerUser } = require('../models');

const createPassengerToken = async (userId) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured');
    }

    const user = await CustomerUser.findByPk(userId, {
        attributes: ['id', 'status', 'block_status'],
    });
    if (!user) {
        throw new Error('Synced user was not found; cannot create passenger token');
    }
    if (user.status === 'Inactive' || user.block_status === 'Block') {
        throw new Error('Inactive or blocked users cannot receive a passenger token');
    }

    return jwt.sign(
        { id: user.id, passenger_id: user.id, role: 'passenger', token_type: 'passenger' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_PASSENGER_EXPIRY || process.env.JWT_ACCESS_EXPIRY || '15m' }
    );
};

const ALLOWED_FIELDS = [
    'city_id',
    'zone_id',
    'name',
    'email',
    'mobile',
    'aadhar',
    'pan',
    'password',
    'address',
    'referral',
    'referral_qrcode',
    'referral_by',
    'sex',
    'device_id',
    'photo',
    'avatar',
    'gallery_images',
    'block_status',
    'online_status',
    'status',
    'mail_created_at',
    'first_time_login',
    'remember_token',
    'complete_status'
];

const userSync = async (req, res) => {

    try {

        // ==========================================
        // CHECK SECRET
        // ==========================================

        const secret = req.headers['x-sync-secret'];

        if (
            !secret ||
            secret !== process.env.NODE_SYNC_SECRET
        ) {
            return res.status(401).json({
                status: false,
                message: 'Unauthorized'
            });
        }


        // ==========================================
        // REQUEST DATA
        // ==========================================

        const {
            action = 'update',
            user_id,
            data
        } = req.body;


        // ==========================================
        // VALIDATE USER ID
        // ==========================================

        if (!user_id) {
            return res.status(422).json({
                status: false,
                message: 'user_id is required'
            });
        }


        // ==========================================
        // VALIDATE DATA
        // ==========================================

        if (
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data)
        ) {
            return res.status(422).json({
                status: false,
                message: 'data is required'
            });
        }


        // ==========================================
        // INSERT
        // ==========================================

        if (action === 'insert') {

            const fields = ['id'];
            const values = [user_id];

            for (const [field, value] of Object.entries(data)) {

                if (!ALLOWED_FIELDS.includes(field)) {
                    continue;
                }

                fields.push(field);

                values.push(
                    value === undefined ? null : value
                );
            }

            const fieldNames = fields
                .map(field => `\`${field}\``)
                .join(', ');

            const placeholders = fields
                .map(() => '?')
                .join(', ');

            const updateFields = fields
                .filter(field => field !== 'id')
                .map(field =>
                    `\`${field}\` = VALUES(\`${field}\`)`
                )
                .join(', ');


            let sql = `
                INSERT INTO users
                (${fieldNames})
                VALUES
                (${placeholders})
            `;

            if (updateFields) {
                sql += `
                    ON DUPLICATE KEY UPDATE
                    ${updateFields}
                `;
            }


            await sequelize.query(sql, {
                replacements: values,
                type: QueryTypes.INSERT
            });

            const token = await createPassengerToken(user_id);

            return res.status(200).json({
                status: true,
                message: 'User inserted successfully',
                user_id: user_id,
                token,
            });
        }


        // ==========================================
        // UPDATE
        // ==========================================

        const updateFields = [];
        const values = [];

        for (const [field, value] of Object.entries(data)) {

            if (!ALLOWED_FIELDS.includes(field)) {
                continue;
            }

            updateFields.push(
                `\`${field}\` = ?`
            );

            values.push(
                value === undefined ? null : value
            );
        }


        // ==========================================
        // NOTHING TO UPDATE
        // ==========================================

        if (updateFields.length === 0) {

            const token = await createPassengerToken(user_id);

            return res.status(200).json({
                status: true,
                message: 'Nothing to update',
                user_id: user_id,
                token,
            });
        }


        // ==========================================
        // UPDATED AT
        // ==========================================

        updateFields.push(
            'updated_at = NOW()'
        );

        values.push(user_id);


        // ==========================================
        // UPDATE QUERY
        // ==========================================

        const sql = `
            UPDATE users
            SET
                ${updateFields.join(', ')}
            WHERE id = ?
        `;


        const [result] = await sequelize.query(sql, {
            replacements: values,
            type: QueryTypes.UPDATE
        });


        // ==========================================
        // USER NOT FOUND
        // ==========================================

        if (result === 0) {

            return res.status(404).json({
                status: false,
                message: 'User not found in Node database',
                user_id: user_id
            });
        }

        const token = await createPassengerToken(user_id);


        // ==========================================
        // SUCCESS
        // ==========================================

        return res.status(200).json({
            status: true,
            message: 'User updated successfully',
            user_id: user_id,
            affected_rows: result,
            token,
        });


    } catch (error) {

        console.error('====================================');
        console.error('LARAVEL USER SYNC ERROR');
        console.error(error);
        console.error('====================================');

        return res.status(500).json({
            status: false,
            message: 'User synchronization failed',
            error: error.message
        });
    }
};


module.exports = {
    userSync
};