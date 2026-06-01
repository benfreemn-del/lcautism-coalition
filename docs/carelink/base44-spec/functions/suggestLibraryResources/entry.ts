import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId } = await req.json();
    if (!clientId) {
      return Response.json({ error: 'Client ID required' }, { status: 400 });
    }

    // Fetch client and related data
    const client = await base44.entities.Client.get(clientId);
    if (!client) {
      return Response.json({ error: 'Client not found' }, { status: 404 });
    }

    // Fetch screening results
    const screenings = await base44.entities.Screening.filter({ client_id: clientId }) || [];
    
    // Fetch behavior incidents for pattern analysis
    const incidents = await base44.entities.BehaviorIncident.filter({ client_id: clientId }) || [];

    // Get library resources
    const resources = await base44.entities.Resource.list(null, 500);

    // Build profile of client's needs
    const profile = {
      ageGroup: calculateAgeGroup(client.dob),
      screeningCategories: extractScreeningData(screenings),
      behaviorPatterns: extractBehaviorPatterns(incidents),
      language: client.preferred_language || 'English',
      housingStatus: client.housing_status,
    };

    // Score and rank resources
    const scoredResources = resources.map(resource => {
      let score = 0;
      const matchReasons = [];

      // Match screening categories with resource category
      if (profile.screeningCategories.length > 0) {
        profile.screeningCategories.forEach(cat => {
          const catLower = cat.toLowerCase();
          if (resource.category?.toLowerCase().includes(catLower) ||
              resource.titleEn?.toLowerCase().includes(catLower) ||
              resource.descriptionEn?.toLowerCase().includes(catLower)) {
            score += 30;
            matchReasons.push(`Matches ${cat} screening`);
          }
        });
      }

      // Match behavior patterns in descriptions
      if (profile.behaviorPatterns.length > 0) {
        profile.behaviorPatterns.forEach(behavior => {
          const behaviorLower = behavior.toLowerCase();
          if (resource.descriptionEn?.toLowerCase().includes(behaviorLower) ||
              resource.titleEn?.toLowerCase().includes(behaviorLower) ||
              resource.descriptionEs?.toLowerCase().includes(behaviorLower)) {
            score += 25;
            matchReasons.push(`Addresses ${behavior}`);
          }
        });
      }

      // Match language preference
      if (resource.languages?.includes(profile.language) || 
          resource.languages?.includes('English') || 
          resource.languages?.includes('Español')) {
        if (profile.language === 'Spanish' && resource.languages?.includes('Español')) {
          score += 20;
          matchReasons.push('Available in Spanish');
        } else if (profile.language === 'English') {
          score += 10;
        }
      }

      // Prioritize featured resources
      if (resource.featured) {
        score += 15;
        matchReasons.push('Featured resource');
      }

      // Match resource type preference
      if (profile.screeningCategories.some(cat => cat.includes('Workshop')) && resource.type === 'Workshop') {
        score += 20;
        matchReasons.push('Workshop format');
      }

      return { 
        ...resource, 
        matchScore: score,
        matchReasons: [...new Set(matchReasons)]
      };
    }).filter(r => r.matchScore > 0);

    // Sort by score descending and return top 8
    const topResources = scoredResources
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 8);

    return Response.json({
      success: true,
      clientProfile: profile,
      suggestedResources: topResources,
      totalMatches: topResources.length,
    });
  } catch (error) {
    console.error('Error suggesting resources:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function calculateAgeGroup(dob) {
  if (!dob) return 'All Ages';
  const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  if (age < 3) return 'Infants & Toddlers';
  if (age < 6) return 'Preschool';
  if (age < 13) return 'School Age';
  if (age < 18) return 'Teens';
  return 'Adults';
}

function extractScreeningData(screenings) {
  const categories = [];
  screenings.forEach(s => {
    // Get screening tool/type
    if (s.tool) categories.push(s.tool);
    // Get flagged domains or areas of concern
    if (s.flagged_domains && Array.isArray(s.flagged_domains)) {
      categories.push(...s.flagged_domains);
    }
    if (s.result && s.result !== 'Typical') {
      categories.push(s.result);
    }
  });
  return [...new Set(categories)].filter(Boolean);
}

function extractBehaviorPatterns(incidents) {
  const patterns = [];
  incidents.forEach(i => {
    // Get behavior type or category
    if (i.behavior_type) patterns.push(i.behavior_type);
    if (i.category) patterns.push(i.category);
    // Extract key behaviors from description
    if (i.description) {
      const desc = i.description.toLowerCase();
      // Extract common behavior keywords
      const keywords = ['aggression', 'meltdown', 'sensory', 'anxiety', 'communication', 'social', 'repetitive', 'elopement', 'self-injury', 'tantrum'];
      keywords.forEach(keyword => {
        if (desc.includes(keyword)) patterns.push(keyword);
      });
    }
    // Get triggers or antecedents
    if (i.triggers && Array.isArray(i.triggers)) {
      patterns.push(...i.triggers);
    } else if (i.triggers) {
      patterns.push(i.triggers);
    }
  });
  return [...new Set(patterns)].filter(Boolean);
}