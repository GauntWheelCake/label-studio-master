from django.db import transaction

from core.utils.disable_signals import DisableSignals
from organizations.models import Organization, OrganizationMember
from projects.models import Project


def create_organization(title, created_by):
    with transaction.atomic():
        org = Organization.objects.create(title=title, created_by=created_by)
        OrganizationMember.objects.create(user=created_by, organization=org)
        return org


def destroy_organization(org):
    # Clean up imported files before cascade deletion
    for project in Project.objects.filter(organization=org).iterator():
        project.delete_uploaded_files()

    with DisableSignals():
        Project.objects.filter(organization=org).delete()
        org.delete()
