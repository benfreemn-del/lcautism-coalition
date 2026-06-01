import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { clientId, profileFactors } = payload;

    if (!profileFactors || !Array.isArray(profileFactors)) {
      return Response.json(
        { error: 'profileFactors array is required' },
        { status: 400 }
      );
    }

    // Fetch client data if clientId provided
    let clientData = null;
    if (clientId) {
      clientData = await base44.entities.Client.filter({ id: clientId }, null, 1);
      if (clientData.length === 0) {
        return Response.json({ error: 'Client not found' }, { status: 404 });
      }
      clientData = clientData[0];
    }

    // Fetch all available resources
    const resources = await base44.entities.Resource.list(null, 1000);

    // Score resources based on profile match
    const scoredResources = resources.map(resource => {
      let matchScore = 0;
      const reasons = [];

      // Age match (if applicable)
      if (profileFactors.includes('age') && clientData?.dob) {
        const age = Math.floor((Date.now() - new Date(clientData.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        if (resource.age_groups && Array.isArray(resource.age_groups)) {
          if (resource.age_groups.some(range => {
            const [min, max] = range.split('-').map(Number);
            return age >= min && age <= max;
          })) {
            matchScore += 15;
            reasons.push('Age-appropriate');
          }
        }
      }

      // Language match
      if (profileFactors.includes('language') && clientData?.preferred_language) {
        const preferredLang = clientData.preferred_language.toLowerCase();
        if (resource.languages && Array.isArray(resource.languages)) {
          if (resource.languages.some(lang => lang.toLowerCase().includes(preferredLang))) {
            matchScore += 20;
            reasons.push(`Available in ${clientData.preferred_language}`);
          }
        }
      }

      // Diagnosis/condition match
      if (profileFactors.includes('diagnosis') && resource.service_types) {
        // Check if resource offers services related to common conditions
        if (Array.isArray(resource.service_types) && resource.service_types.length > 0) {
          matchScore += 15;
          reasons.push('Relevant services offered');
        }
      }

      // Location/accessibility
      if (profileFactors.includes('location') && clientData?.city && resource.city) {
        if (clientData.city.toLowerCase() === resource.city.toLowerCase()) {
          matchScore += 25;
          reasons.push('Located in your area');
        } else if (clientData.state && clientData.state === resource.state) {
          matchScore += 10;
          reasons.push('Within your state');
        }
      }

      // Housing status support
      if (profileFactors.includes('housing_status') && clientData?.housing_status) {
        const housingSupport = ['Permanent', 'Transitional', 'Shelter'].includes(clientData.housing_status);
        if (housingSupport && resource.specializations && Array.isArray(resource.specializations)) {
          if (resource.specializations.some(s => s.toLowerCase().includes('housing'))) {
            matchScore += 10;
            reasons.push('Provides housing support');
          }
        }
      }

      // Cultural responsiveness
      if (resource.culturally_responsive) {
        matchScore += 10;
        reasons.push('Culturally responsive');
      }

      // Free/low-cost priority
      if (resource.cost_type === 'Free' || resource.cost_type === 'Low-cost') {
        matchScore += 5;
        reasons.push(`${resource.cost_type}`);
      }

      return {
        ...resource,
        matchScore: Math.min(100, matchScore),
        matchReasons: reasons,
      };
    });

    // Sort by match score and filter top matches
    const topMatches = scoredResources
      .filter(r => r.matchScore >= 25)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10);

    // Create ResourceMatch record if clientId provided
    if (clientId && topMatches.length > 0) {
      const suggestedResources = topMatches.map(resource => ({
        resource_id: resource.id,
        resource_name: resource.name,
        category: resource.category || 'General',
        match_score: resource.matchScore,
        reason: resource.matchReasons.join('; '),
        contact: resource.contact_info,
        location: `${resource.city}, ${resource.state}`,
      }));

      await base44.entities.ResourceMatch.create({
        client_id: clientId,
        client_name: clientData ? `${clientData.legal_first_name} ${clientData.legal_last_name}` : 'Unknown',
        match_date: new Date().toISOString(),
        profile_factors: profileFactors,
        suggested_resources: suggestedResources,
        status: 'Pending Approval',
      });
    }

    return Response.json({
      success: true,
      matchCount: topMatches.length,
      recommendations: topMatches.map(r => ({
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        contactInfo: r.contact_info,
        website: r.website,
        city: r.city,
        state: r.state,
        serviceTypes: r.service_types,
        languages: r.languages,
        matchScore: r.matchScore,
        matchReasons: r.matchReasons,
        costType: r.cost_type,
        culturallyResponsive: r.culturally_responsive,
      })),
      profileAnalyzed: {
        clientName: clientData ? `${clientData.legal_first_name} ${clientData.legal_last_name}` : null,
        language: clientData?.preferred_language,
        location: clientData ? `${clientData.city}, ${clientData.state}` : null,
        housingStatus: clientData?.housing_status,
      },
    });
  } catch (error) {
    console.error('Error in resource recommendation:', error);
    return Response.json(
      { error: error.message || 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
});