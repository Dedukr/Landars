import json

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import CustomUser

# Create your views here.


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    """Register a new user"""
    try:
        data = json.loads(request.body)
        email = data.get("email")
        password = data.get("password")
        name = data.get("name")

        if not email or not password or not name:
            return Response(
                {"error": "Email, password, and name are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if user already exists
        if CustomUser.objects.filter(email=email).exists():
            return Response(
                {"error": "User with this email already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if CustomUser.objects.filter(name=name).exists():
            return Response(
                {"error": "User with this name already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create new user
        user = CustomUser.objects.create_user(name=name, email=email, password=password)

        # Create token for the user
        token, created = Token.objects.get_or_create(user=user)

        return Response(
            {
                "message": "User created successfully",
                "token": token.key,
                "user": {"id": user.id, "name": user.name, "email": user.email},
            },
            status=status.HTTP_201_CREATED,
        )

    except json.JSONDecodeError:
        return Response({"error": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """Login a user"""
    try:
        data = json.loads(request.body)
        email = data.get("email")
        password = data.get("password")

        if not email or not password:
            return Response(
                {"error": "Email and password are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Authenticate user
        user = authenticate(request, username=email, password=password)

        if user is None:
            return Response(
                {"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED
            )

        # Get or create token
        token, created = Token.objects.get_or_create(user=user)

        return Response(
            {
                "message": "Login successful",
                "token": token.key,
                "user": {"id": user.id, "name": user.name, "email": user.email},
            },
            status=status.HTTP_200_OK,
        )

    except json.JSONDecodeError:
        return Response({"error": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["POST"])
def logout_view(request):
    """Logout a user"""
    try:
        # Delete the token
        if hasattr(request, "user") and request.user.is_authenticated:
            Token.objects.filter(user=request.user).delete()

        return Response({"message": "Logout successful"}, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
def user_profile(request):
    """Get user profile"""
    if not request.user.is_authenticated:
        return Response(
            {"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED
        )

    return Response(
        {
            "user": {
                "id": request.user.id,
                "name": request.user.name,
                "email": request.user.email,
            }
        },
        status=status.HTTP_200_OK,
    )
