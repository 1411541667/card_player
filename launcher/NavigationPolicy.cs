using System;

internal static class NavigationPolicy
{
    internal static bool IsAllowed(Uri? uri, string applicationOrigin)
    {
        if (uri is null || !Uri.TryCreate(applicationOrigin, UriKind.Absolute, out var origin)) return false;

        return uri.Scheme == origin.Scheme &&
               uri.Host.Equals(origin.Host, StringComparison.OrdinalIgnoreCase) &&
               uri.Port == origin.Port;
    }
}
