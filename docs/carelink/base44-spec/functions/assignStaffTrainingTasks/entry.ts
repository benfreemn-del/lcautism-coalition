import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ROLE_TRAINING_MAP = {
  'Executive Director': ['HIPAA Training', 'FERPA Training', 'Safety Protocols'],
  'Program Director': ['HIPAA Training', 'FERPA Training', 'Safety Protocols', 'Culturally Responsive Practice'],
  'Community Health and Developmental Support Specialist': ['HIPAA Training', 'FERPA Training', 'CPR/First Aid', 'Clinical Skills'],
  'Bilingual Program Coordinator': ['HIPAA Training', 'FERPA Training', 'Culturally Responsive Practice'],
  'Community Health Worker': ['HIPAA Training', 'CPR/First Aid', 'Clinical Skills'],
  'Care Coordinator': ['HIPAA Training', 'FERPA Training', 'CPR/First Aid'],
  'Family Navigator': ['HIPAA Training', 'Culturally Responsive Practice'],
  'Workshop Facilitator': ['HIPAA Training', 'Culturally Responsive Practice', 'Safety Protocols'],
  'Administrative Support': ['HIPAA Training'],
  'Volunteer/Peer Mentor': ['HIPAA Training', 'Safety Protocols'],
  'Contracted Clinical Consultant': ['HIPAA Training', 'FERPA Training'],
  'Multidisciplinary Partner': ['HIPAA Training', 'FERPA Training'],
  'Reception': ['HIPAA Training'],
  'Assistance': ['HIPAA Training'],
  'Tech Support': []
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { staff_id, staff_name, role } = await req.json();

    if (!staff_id || !role) {
      return Response.json({ error: 'Missing staff_id or role' }, { status: 400 });
    }

    // Get training courses for this role
    const requiredTrainings = ROLE_TRAINING_MAP[role] || [];
    
    if (requiredTrainings.length === 0) {
      return Response.json({ message: 'No required trainings for this role', tasksCreated: [] });
    }

    // Get all training courses
    const allCourses = await base44.entities.TrainingCourse.list();
    const matchingCourses = allCourses.filter(c => 
      requiredTrainings.includes(c.category)
    );

    // Create Task records for each required training
    const tasksCreated = [];
    for (const course of matchingCourses) {
      const task = await base44.asServiceRole.entities.Task.create({
        title: `Complete: ${course.title}`,
        description: `Required training for ${role} - ${course.title}`,
        assigned_to: staff_name,
        status: 'pending',
        priority: 'high',
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        task_type: 'training',
        related_staff_id: staff_id,
        related_training_course_id: course.id,
        created_by: user.email
      });
      tasksCreated.push(task);
    }

    return Response.json({
      message: `Created ${tasksCreated.length} training tasks`,
      tasksCreated
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});