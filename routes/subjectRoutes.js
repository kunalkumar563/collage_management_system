const express = require('express');
const router = express.Router();
const { getSubjects, createSubject } = require('../controllers/subjectController');

router.get('/', getSubjects);
router.post('/', createSubject);

module.exports = router;
