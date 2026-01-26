import { body, validationResult } from "express-validator";
import TimeEntry from "../models/timeEntryModel.js";
import Contract from "../models/contractModel.js";
import Invoice from "../models/invoiceModel.js";
import { uploadMultipleFiles, BUCKETS } from "../utils/storage.js";

function isValidHttpUrl(value) {
    if (typeof value !== "string") return false;
    try {
        const u = new URL(value);
        if (!(u.protocol === "http:" || u.protocol === "https:")) return false;
        const host = u.hostname;
        return host === "localhost" || host.includes(".");
    } catch {
        return false;
    }
}

/**
 * Validation middleware for creating time entries
 */
export const validateTimeEntry = [
    body("contract_id").isUUID().withMessage("Valid contract ID is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("start_time").isISO8601().withMessage("Valid start time is required"),
    body("duration_minutes")
        .optional()
        .isInt({ min: 1, max: 1440 })
        .withMessage("Duration must be between 1 and 1440 minutes"),
    body("evidence").optional(),
];

/**
 * Create a new time entry
 */
export const createTimeEntry = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const expertProfileId = req.user.profileId;
        const { contract_id, description, start_time, end_time, duration_minutes } = req.body;

        // Only allow logging time for today
        const startDateObj = new Date(start_time);
        const startDay = new Date(
            startDateObj.getFullYear(),
            startDateObj.getMonth(),
            startDateObj.getDate()
        );
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (startDay.getTime() !== todayStart.getTime()) {
            return res.status(400).json({
                success: false,
                message: "You can only log time for today",
                code: "DATE_NOT_ALLOWED",
            });
        }

        // Parse evidence from body (works for both JSON and multipart submissions)
        let evidenceFromBody = {};
        if (req.body.evidence) {
            try {
                evidenceFromBody =
                    typeof req.body.evidence === "string" ? JSON.parse(req.body.evidence) : req.body.evidence;

                if (typeof evidenceFromBody !== "object" || evidenceFromBody === null) {
                    evidenceFromBody = {};
                }
            } catch (e) {
                console.warn("Invalid evidence JSON, using empty object:", req.body.evidence);
                evidenceFromBody = {};
            }
        }

        // Validate links (if provided)
        if (Array.isArray(evidenceFromBody.links)) {
            const normalizedLinks = [];
            for (let i = 0; i < evidenceFromBody.links.length; i++) {
                const link = evidenceFromBody.links[i];
                const url = typeof link === "string" ? link : link?.url;
                if (!isValidHttpUrl(url)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid evidence link at position ${i + 1}`,
                        code: "INVALID_EVIDENCE_LINK",
                    });
                }
                normalizedLinks.push({
                    label:
                        typeof link === "object" && link?.label ? String(link.label) : "Link",
                    url,
                });
            }

            evidenceFromBody = { ...evidenceFromBody, links: normalizedLinks };
        }

        // Handle file uploads + merge with evidence body
        let evidence = evidenceFromBody;
        if (req.files && req.files.length > 0) {
            const files = req.files.map((file) => ({
                name: file.originalname,
                buffer: file.buffer,
                contentType: file.mimetype,
            }));

            const folder = `contract-${contract_id}/time-entry-${Date.now()}`;
            const uploadedFiles = await uploadMultipleFiles(
                BUCKETS.WORK_LOGS,
                files,
                folder
            );

            const uploadedAttachments = uploadedFiles.map((f) => ({
                name: f.path.split("/").pop(),
                url: f.url,
                path: f.path,
            }));

            evidence = {
                ...evidence,
                attachments: uploadedAttachments,
            };
        }

        // Verify the contract exists and expert is part of it
        const contract = await Contract.getById(contract_id);
        if (!contract) {
            return res.status(404).json({
                success: false,
                message: "Contract not found",
            });
        }

        if (contract.expert_profile_id !== expertProfileId) {
            return res.status(403).json({
                success: false,
                message: "You can only log time for your own contracts",
            });
        }

        if (contract.engagement_model !== "hourly") {
            return res.status(400).json({
                success: false,
                message: "Time entries are only for hourly contracts",
            });
        }

        if (contract.status !== "active") {
            return res.status(400).json({
                success: false,
                message: "Contract must be active to log time",
            });
        }

        // Get hourly rate from contract payment terms
        const paymentTerms =
            typeof contract.payment_terms === "string"
                ? JSON.parse(contract.payment_terms)
                : contract.payment_terms || {};

        const hourlyRate = paymentTerms.hourly_rate;
        if (!hourlyRate) {
            return res.status(400).json({
                success: false,
                message: "Contract does not have an hourly rate configured",
            });
        }

        // Calculate duration if end_time is provided
        let calculatedDuration = duration_minutes;
        if (end_time) {
            const start = new Date(start_time);
            const end = new Date(end_time);
            if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid start/end time",
                    code: "INVALID_TIME_RANGE",
                });
            }
            if (end.getTime() <= start.getTime()) {
                return res.status(400).json({
                    success: false,
                    message: "End time must be after start time",
                    code: "INVALID_TIME_RANGE",
                });
            }
            if (!duration_minutes) {
                calculatedDuration = Math.round((end - start) / (1000 * 60));
            }
        }

        const durationInt = Number(calculatedDuration);
        if (!Number.isFinite(durationInt) || durationInt < 1 || durationInt > 1440) {
            return res.status(400).json({
                success: false,
                message: "Duration must be between 1 and 1440 minutes",
                code: "INVALID_DURATION",
            });
        }

        // Do not allow a time entry to spill into the next day
        try {
            const start = new Date(start_time);
            if (!Number.isFinite(start.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid start time",
                    code: "INVALID_TIME_RANGE",
                });
            }

            const end = end_time
                ? new Date(end_time)
                : new Date(start.getTime() + durationInt * 60 * 1000);

            if (!Number.isFinite(end.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid end time",
                    code: "INVALID_TIME_RANGE",
                });
            }

            const startDayKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
            const endDayKey = `${end.getFullYear()}-${end.getMonth()}-${end.getDate()}`;
            if (endDayKey !== startDayKey) {
                return res.status(400).json({
                    success: false,
                    message: "Time entry cannot cross into the next day",
                    code: "CROSSES_DAY_NOT_ALLOWED",
                });
            }
        } catch {
            return res.status(400).json({
                success: false,
                message: "Invalid time range",
                code: "INVALID_TIME_RANGE",
            });
        }

        // Block overlapping time ranges for the same expert+contract on the same day
        const startForCheck = new Date(start_time);
        const endForCheck = end_time
            ? new Date(end_time)
            : new Date(startForCheck.getTime() + durationInt * 60 * 1000);
        const overlapping = await TimeEntry.findOverlapping({
            contractId: contract_id,
            expertProfileId,
            startTime: startForCheck.toISOString(),
            endTime: endForCheck.toISOString(),
        });
        if (overlapping) {
            return res.status(409).json({
                success: false,
                message: "This time range overlaps with an existing time entry",
                code: "OVERLAPPING_TIME_ENTRY",
            });
        }

        const timeEntry = await TimeEntry.create({
            contractId: contract_id,
            expertProfileId,
            description,
            startTime: start_time,
            endTime: end_time || null,
            durationMinutes: durationInt,
            hourlyRate,
            evidence,
        });

        res.status(201).json({
            success: true,
            message: "Time entry created",
            data: timeEntry,
        });
    } catch (error) {
        console.error("Create time entry error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create time entry",
            error: error.message,
        });
    }
};

/**
 * Get time entries for a contract
 */
export const getTimeEntriesByContract = async (req, res) => {
    try {
        const { contractId } = req.params;
        const profileId = req.user.profileId;
        const userRole = req.user.role;

        // Verify access to contract
        const contract = await Contract.getById(contractId);
        if (!contract) {
            return res.status(404).json({
                success: false,
                message: "Contract not found",
            });
        }

        if (
            contract.buyer_profile_id !== profileId &&
            contract.expert_profile_id !== profileId &&
            userRole !== "admin"
        ) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this contract",
            });
        }

        const timeEntries = await TimeEntry.getByContractId(contractId);

        res.status(200).json({
            success: true,
            data: timeEntries,
        });
    } catch (error) {
        console.error("Get time entries error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch time entries",
            error: error.message,
        });
    }
};

/**
 * Update a time entry (draft only)
 */
export const updateTimeEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const expertProfileId = req.user.profileId;
        const { description, start_time, end_time, duration_minutes } = req.body;

        const existing = await TimeEntry.getById(id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Time entry not found",
            });
        }

        if (existing.expert_profile_id !== expertProfileId) {
            return res.status(403).json({
                success: false,
                message: "You can only edit your own time entries",
            });
        }

        if (existing.status !== "draft") {
            return res.status(400).json({
                success: false,
                message: "Only draft entries can be edited",
            });
        }

        // Only allow editing time entries for today
        const effectiveStart = start_time || existing.start_time;
        const effectiveStartObj = new Date(effectiveStart);
        const effectiveDay = new Date(
            effectiveStartObj.getFullYear(),
            effectiveStartObj.getMonth(),
            effectiveStartObj.getDate()
        );
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (effectiveDay.getTime() !== todayStart.getTime()) {
            return res.status(400).json({
                success: false,
                message: "You can only edit time entries for today",
                code: "DATE_NOT_ALLOWED",
            });
        }

        // Validate duration range and end_time ordering if provided
        if (end_time && effectiveStart) {
            const start = new Date(effectiveStart);
            const end = new Date(end_time);
            if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid start/end time",
                    code: "INVALID_TIME_RANGE",
                });
            }
            if (end.getTime() <= start.getTime()) {
                return res.status(400).json({
                    success: false,
                    message: "End time must be after start time",
                    code: "INVALID_TIME_RANGE",
                });
            }

            const startDayKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
            const endDayKey = `${end.getFullYear()}-${end.getMonth()}-${end.getDate()}`;
            if (endDayKey !== startDayKey) {
                return res.status(400).json({
                    success: false,
                    message: "Time entry cannot cross into the next day",
                    code: "CROSSES_DAY_NOT_ALLOWED",
                });
            }
        }

        if (duration_minutes !== undefined) {
            const durationInt = Number(duration_minutes);
            if (!Number.isFinite(durationInt) || durationInt < 1 || durationInt > 1440) {
                return res.status(400).json({
                    success: false,
                    message: "Duration must be between 1 and 1440 minutes",
                    code: "INVALID_DURATION",
                });
            }
        }

        // If no explicit end_time, ensure start + duration stays within the same day
        if (!end_time) {
            const effectiveDuration = duration_minutes !== undefined ? Number(duration_minutes) : Number(existing.duration_minutes);
            const start = new Date(effectiveStart);
            if (Number.isFinite(start.getTime()) && Number.isFinite(effectiveDuration) && effectiveDuration > 0) {
                const derivedEnd = new Date(start.getTime() + effectiveDuration * 60 * 1000);
                const startDayKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
                const endDayKey = `${derivedEnd.getFullYear()}-${derivedEnd.getMonth()}-${derivedEnd.getDate()}`;
                if (endDayKey !== startDayKey) {
                    return res.status(400).json({
                        success: false,
                        message: "Time entry cannot cross into the next day",
                        code: "CROSSES_DAY_NOT_ALLOWED",
                    });
                }
            }
        }

        // Block overlapping time ranges for the same expert+contract on the same day
        // (ignore rejected entries, and exclude this entry itself)
        const overlapStart = new Date(effectiveStart);
        const effectiveDurationForOverlap = duration_minutes !== undefined
            ? Number(duration_minutes)
            : Number(existing.duration_minutes);
        const overlapEnd = end_time
            ? new Date(end_time)
            : new Date(overlapStart.getTime() + (Number.isFinite(effectiveDurationForOverlap) ? effectiveDurationForOverlap : 0) * 60 * 1000);
        if (!Number.isFinite(overlapStart.getTime()) || !Number.isFinite(overlapEnd.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid time range",
                code: "INVALID_TIME_RANGE",
            });
        }
        const overlapping = await TimeEntry.findOverlapping({
            contractId: existing.contract_id,
            expertProfileId,
            startTime: overlapStart.toISOString(),
            endTime: overlapEnd.toISOString(),
            excludeId: id,
        });
        if (overlapping) {
            return res.status(409).json({
                success: false,
                message: "This time range overlaps with an existing time entry",
                code: "OVERLAPPING_TIME_ENTRY",
            });
        }

        // Parse evidence from body (works for both JSON and multipart submissions)
        let evidenceFromBody = {};
        if (req.body.evidence) {
            try {
                evidenceFromBody =
                    typeof req.body.evidence === "string" ? JSON.parse(req.body.evidence) : req.body.evidence;

                if (typeof evidenceFromBody !== "object" || evidenceFromBody === null) {
                    evidenceFromBody = {};
                }
            } catch (e) {
                console.warn("Invalid evidence JSON, using empty object:", req.body.evidence);
                evidenceFromBody = {};
            }
        }

        // Validate links (if provided)
        if (Array.isArray(evidenceFromBody.links)) {
            const normalizedLinks = [];
            for (let i = 0; i < evidenceFromBody.links.length; i++) {
                const link = evidenceFromBody.links[i];
                const url = typeof link === "string" ? link : link?.url;
                if (!isValidHttpUrl(url)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid evidence link at position ${i + 1}`,
                        code: "INVALID_EVIDENCE_LINK",
                    });
                }
                normalizedLinks.push({
                    label:
                        typeof link === "object" && link?.label ? String(link.label) : "Link",
                    url,
                });
            }

            evidenceFromBody = { ...evidenceFromBody, links: normalizedLinks };
        }

        // Merge with existing evidence and append new uploads
        const existingEvidence =
            existing?.evidence && typeof existing.evidence === "string"
                ? (() => {
                      try {
                          return JSON.parse(existing.evidence);
                      } catch {
                          return {};
                      }
                  })()
                : (existing?.evidence || {});

        let evidence = { ...existingEvidence, ...evidenceFromBody };
        if (req.files && req.files.length > 0) {
            const files = req.files.map((file) => ({
                name: file.originalname,
                buffer: file.buffer,
                contentType: file.mimetype,
            }));

            const folder = `contract-${existing.contract_id}/time-entry-${id}-${Date.now()}`;
            const uploadedFiles = await uploadMultipleFiles(
                BUCKETS.WORK_LOGS,
                files,
                folder
            );

            const uploadedAttachments = uploadedFiles.map((f) => ({
                name: f.path.split("/").pop(),
                url: f.url,
                path: f.path,
            }));

            const prev = Array.isArray(evidence.attachments) ? evidence.attachments : [];
            evidence = {
                ...evidence,
                attachments: [...prev, ...uploadedAttachments],
            };
        }

        const updated = await TimeEntry.update(id, {
            description,
            startTime: start_time,
            endTime: end_time,
            durationMinutes: duration_minutes,
            evidence: (req.body.evidence || (req.files && req.files.length > 0))
                ? evidence
                : undefined,
        });

        res.status(200).json({
            success: true,
            message: "Time entry updated",
            data: updated,
        });
    } catch (error) {
        console.error("Update time entry error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update time entry",
            error: error.message,
        });
    }
};

/**
 * Submit time entry for approval
 */
export const submitTimeEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const expertProfileId = req.user.profileId;

        const existing = await TimeEntry.getById(id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Time entry not found",
            });
        }

        if (existing.expert_profile_id !== expertProfileId) {
            return res.status(403).json({
                success: false,
                message: "You can only submit your own time entries",
            });
        }

        if (!existing.duration_minutes || existing.duration_minutes <= 0) {
            return res.status(400).json({
                success: false,
                message: "Time entry must have a valid duration before submitting",
            });
        }

        const submitted = await TimeEntry.submit(id);
        if (!submitted) {
            return res.status(400).json({
                success: false,
                message: "Only draft entries can be submitted",
            });
        }

        res.status(200).json({
            success: true,
            message: "Time entry submitted for approval",
            data: submitted,
        });
    } catch (error) {
        console.error("Submit time entry error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to submit time entry",
            error: error.message,
        });
    }
};

/**
 * Approve time entry (buyer only)
 */
export const approveTimeEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const buyerProfileId = req.user.profileId;
        const { comment } = req.body;

        const existing = await TimeEntry.getById(id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Time entry not found",
            });
        }

        // Verify buyer owns the contract
        const contract = await Contract.getById(existing.contract_id);
        if (!contract || contract.buyer_profile_id !== buyerProfileId) {
            return res.status(403).json({
                success: false,
                message: "Only the contract buyer can approve time entries",
            });
        }

        const approved = await TimeEntry.approve(id, comment);
        if (!approved) {
            return res.status(400).json({
                success: false,
                message: "Only submitted entries can be approved",
            });
        }

        // Auto-create an invoice for approved hours (hourly contracts)
        let invoice = null;
        try {
            if (contract.engagement_model === "hourly") {
                const existingInvoice = await Invoice.findBySource("time_entry", approved.id);
                if (!existingInvoice) {
                    const minutes = Number(approved.duration_minutes || 0);
                    const hours = minutes > 0 ? minutes / 60.0 : 0;
                    const rate = Number(approved.hourly_rate || 0);
                    const amountFromDb = Number(approved.amount);
                    const amount = Number.isFinite(amountFromDb) && amountFromDb > 0
                        ? amountFromDb
                        : hours * rate;

                    if (hours > 0 && amount > 0) {
                        invoice = await Invoice.create({
                            contract_id: approved.contract_id,
                            expert_profile_id: contract.expert_profile_id,
                            buyer_profile_id: contract.buyer_profile_id,
                            amount,
                            total_hours: hours,
                            status: "pending",
                            invoice_type: "periodic",
                            week_start_date: null,
                            week_end_date: null,
                            source_type: "time_entry",
                            source_id: approved.id,
                        });
                    }
                } else {
                    invoice = existingInvoice;
                }
            }
        } catch (invErr) {
            // Do not fail approval if invoice generation fails; surface warning in response.
            console.error("Auto-invoice creation failed:", invErr);
        }

        res.status(200).json({
            success: true,
            message: "Time entry approved",
            data: { timeEntry: approved, invoice },
        });
    } catch (error) {
        console.error("Approve time entry error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to approve time entry",
            error: error.message,
        });
    }
};

/**
 * Reject time entry (buyer only)
 */
export const rejectTimeEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const buyerProfileId = req.user.profileId;
        const { comment } = req.body;

        if (!comment) {
            return res.status(400).json({
                success: false,
                message: "Rejection reason is required",
            });
        }

        const existing = await TimeEntry.getById(id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Time entry not found",
            });
        }

        // Verify buyer owns the contract
        const contract = await Contract.getById(existing.contract_id);
        if (!contract || contract.buyer_profile_id !== buyerProfileId) {
            return res.status(403).json({
                success: false,
                message: "Only the contract buyer can reject time entries",
            });
        }

        const rejected = await TimeEntry.reject(id, comment);
        if (!rejected) {
            return res.status(400).json({
                success: false,
                message: "Only submitted entries can be rejected",
            });
        }

        res.status(200).json({
            success: true,
            message: "Time entry rejected",
            data: rejected,
        });
    } catch (error) {
        console.error("Reject time entry error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reject time entry",
            error: error.message,
        });
    }
};

/**
 * Delete a time entry (draft only)
 */
export const deleteTimeEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const expertProfileId = req.user.profileId;

        const existing = await TimeEntry.getById(id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Time entry not found",
            });
        }

        if (existing.expert_profile_id !== expertProfileId) {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own time entries",
            });
        }

        const deleted = await TimeEntry.delete(id);
        if (!deleted) {
            return res.status(400).json({
                success: false,
                message: "Only draft entries can be deleted",
            });
        }

        res.status(200).json({
            success: true,
            message: "Time entry deleted",
        });
    } catch (error) {
        console.error("Delete time entry error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete time entry",
            error: error.message,
        });
    }
};

/**
 * Get approved hours summary for a contract
 */
export const getTimeEntrySummary = async (req, res) => {
    try {
        const { contractId } = req.params;
        const profileId = req.user.profileId;
        const userRole = req.user.role;

        // Verify access to contract
        const contract = await Contract.getById(contractId);
        if (!contract) {
            return res.status(404).json({
                success: false,
                message: "Contract not found",
            });
        }

        if (
            contract.buyer_profile_id !== profileId &&
            contract.expert_profile_id !== profileId &&
            userRole !== "admin"
        ) {
            return res.status(403).json({
                success: false,
                message: "You do not have access to this contract",
            });
        }

        const summary = await TimeEntry.getApprovedSummary(contractId);

        res.status(200).json({
            success: true,
            data: {
                totalEntries: parseInt(summary.total_entries) || 0,
                totalMinutes: parseInt(summary.total_minutes) || 0,
                totalHours: (parseInt(summary.total_minutes) || 0) / 60,
                totalAmount: parseFloat(summary.total_amount) || 0,
            },
        });
    } catch (error) {
        console.error("Get time entry summary error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch summary",
            error: error.message,
        });
    }
};

export default {
    validateTimeEntry,
    createTimeEntry,
    getTimeEntriesByContract,
    updateTimeEntry,
    submitTimeEntry,
    approveTimeEntry,
    rejectTimeEntry,
    deleteTimeEntry,
    getTimeEntrySummary,
};
