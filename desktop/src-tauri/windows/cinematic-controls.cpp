#define NOMINMAX
#include <windows.h>
#include <commctrl.h>
#include <gdiplus.h>
#include <uxtheme.h>
#include <algorithm>
#include <iterator>
#include <new>

// Only painting and edit insets are customized. Native controls retain their
// keyboard, accessibility, check-state and NSIS command/notification behavior.
namespace {
using namespace Gdiplus;
constexpr UINT_PTR SubclassId = 0x534C;
constexpr UINT_PTR WindowSubclassId = 0x534D;
constexpr wchar_t DesignDpiProperty[] = L"SiloLink.DesignDpi";
enum class Kind { Primary = 1, Secondary, Ghost, Checkbox, Edit, Close = 7 };
struct ControlStyle { Kind kind; bool hover = false; };
struct WindowStyle { int dpi; int width = 0; int height = 0; };
INIT_ONCE graphicsOnce = INIT_ONCE_STATIC_INIT;
ULONG_PTR graphicsToken = 0;
constexpr COLORREF Surface = RGB(25, 26, 29);
constexpr COLORREF Input = RGB(34, 35, 40);

BOOL CALLBACK StartGraphics(PINIT_ONCE, PVOID, PVOID*) {
    GdiplusStartupInput startup;
    return GdiplusStartup(&graphicsToken, &startup, nullptr) == Ok;
}
int Pixels(HWND window, int value) {
    const auto designDpi = reinterpret_cast<INT_PTR>(GetPropW(GetAncestor(window, GA_ROOT), DesignDpiProperty));
    return MulDiv(value, designDpi ? static_cast<int>(designDpi) : static_cast<int>(GetDpiForWindow(window)), 96);
}
Color ColorOf(COLORREF value) {
    return Color(255, GetRValue(value), GetGValue(value), GetBValue(value));
}
void RoundPath(GraphicsPath& path, RectF bounds, REAL radius) {
    const REAL diameter = std::min(radius * 2, std::min(bounds.Width, bounds.Height));
    path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
    path.AddArc(bounds.GetRight() - diameter, bounds.Y, diameter, diameter, 270, 90);
    path.AddArc(bounds.GetRight() - diameter, bounds.GetBottom() - diameter, diameter, diameter, 0, 90);
    path.AddArc(bounds.X, bounds.GetBottom() - diameter, diameter, diameter, 90, 90);
    path.CloseFigure();
}
void Rounded(Graphics& graphics, RectF bounds, REAL radius, COLORREF fill, COLORREF border, bool outline) {
    GraphicsPath path;
    RoundPath(path, bounds, radius);
    SolidBrush brush(ColorOf(fill));
    graphics.FillPath(&brush, &path);
    if (outline) {
        Pen pen(ColorOf(border), 1);
        graphics.DrawPath(&pen, &path);
    }
}
void Text(HDC dc, HWND window, RECT bounds, COLORREF color, UINT alignment) {
    wchar_t label[512]{};
    GetWindowTextW(window, label, static_cast<int>(std::size(label)));
    const auto font = reinterpret_cast<HFONT>(SendMessageW(window, WM_GETFONT, 0, 0));
    const auto oldFont = SelectObject(dc, font ? font : GetStockObject(DEFAULT_GUI_FONT));
    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, color);
    DrawTextW(dc, label, -1, &bounds, alignment | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
    SelectObject(dc, oldFont);
}
bool PaintControl(HWND window, HDC target, const ControlStyle& style) {
    RECT client{};
    GetClientRect(window, &client);
    if (client.right <= 0 || client.bottom <= 0) return false;
    const HDC buffer = CreateCompatibleDC(target);
    if (!buffer) return false;
    const HBITMAP bitmap = CreateCompatibleBitmap(target, client.right, client.bottom);
    if (!bitmap) { DeleteDC(buffer); return false; }
    const auto oldBitmap = SelectObject(buffer, bitmap);
    {
        Graphics graphics(buffer);
        graphics.SetSmoothingMode(SmoothingModeAntiAlias);
        graphics.Clear(ColorOf(style.kind == Kind::Close ? RGB(20, 21, 23) : Surface));
        const bool enabled = IsWindowEnabled(window) != FALSE;
        const bool focused = GetFocus() == window;
        const bool pressed = (SendMessageW(window, BM_GETSTATE, 0, 0) & BST_PUSHED) != 0;
        if (style.kind == Kind::Checkbox) {
            const int box = Pixels(window, 15);
            const int left = Pixels(window, 1);
            const int top = (client.bottom - box) / 2;
            const bool checked = SendMessageW(window, BM_GETCHECK, 0, 0) == BST_CHECKED;
            const COLORREF fill = checked ? (enabled ? RGB(232, 232, 229) : RGB(91, 94, 101)) : Input;
            const COLORREF edge = focused || style.hover ? RGB(185, 188, 197) : RGB(100, 104, 114);
            Rounded(graphics, RectF(static_cast<REAL>(left) + .5f, static_cast<REAL>(top) + .5f,
                static_cast<REAL>(box - 1), static_cast<REAL>(box - 1)),
                static_cast<REAL>(Pixels(window, 4)), fill, edge, !checked || focused);
            if (checked) {
                Pen check(ColorOf(RGB(25, 26, 29)), static_cast<REAL>(Pixels(window, 2)));
                check.SetStartCap(LineCapRound);
                check.SetEndCap(LineCapRound);
                PointF points[] = {
                    PointF(static_cast<REAL>(left + box * .24f), static_cast<REAL>(top + box * .52f)),
                    PointF(static_cast<REAL>(left + box * .44f), static_cast<REAL>(top + box * .72f)),
                    PointF(static_cast<REAL>(left + box * .77f), static_cast<REAL>(top + box * .31f))
                };
                graphics.DrawLines(&check, points, static_cast<INT>(std::size(points)));
            }
            RECT label{left + box + Pixels(window, 9), 0, client.right, client.bottom};
            graphics.Flush(FlushIntentionSync);
            Text(buffer, window, label, enabled ? RGB(174, 176, 184) : RGB(113, 117, 126), DT_LEFT);
        } else {
            COLORREF fill = style.kind == Kind::Close ? RGB(20, 21, 23) : Surface;
            COLORREF foreground = RGB(181, 184, 192);
            if (style.kind == Kind::Primary) {
                fill = !enabled ? RGB(53, 55, 62) : pressed ? RGB(202, 204, 209) : style.hover ? RGB(255, 255, 252) : RGB(239, 239, 236);
                foreground = enabled ? RGB(23, 24, 26) : RGB(125, 129, 139);
            } else if (style.kind == Kind::Secondary) {
                fill = !enabled ? RGB(36, 37, 42) : pressed ? RGB(55, 57, 64) : style.hover ? RGB(58, 60, 68) : RGB(44, 45, 50);
                foreground = enabled ? RGB(226, 228, 234) : RGB(109, 113, 122);
            } else if (enabled && (style.hover || pressed)) {
                fill = pressed ? RGB(46, 48, 54) : RGB(36, 38, 43);
            }
            Rounded(graphics, RectF(.5f, .5f, static_cast<REAL>(client.right - 1), static_cast<REAL>(client.bottom - 1)),
                static_cast<REAL>(Pixels(window, 8)), fill, RGB(144, 149, 161), focused && enabled);
            if (style.kind != Kind::Close) {
                RECT label = client;
                graphics.Flush(FlushIntentionSync);
                Text(buffer, window, label, foreground, DT_CENTER);
            }
        }
        graphics.Flush(FlushIntentionSync);
    }
    if (style.kind == Kind::Close) {
        const auto font = CreateFontW(-Pixels(window, 20), 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
            DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
        const auto previous = SelectObject(buffer, font);
        SetBkMode(buffer, TRANSPARENT);
        SetTextColor(buffer, IsWindowEnabled(window) ? RGB(174, 177, 185) : RGB(89, 93, 103));
        DrawTextW(buffer, L"\u00D7", -1, &client, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
        SelectObject(buffer, previous);
        DeleteObject(font);
    }
    BitBlt(target, 0, 0, client.right, client.bottom, buffer, 0, 0, SRCCOPY);
    SelectObject(buffer, oldBitmap);
    DeleteObject(bitmap);
    DeleteDC(buffer);
    return true;
}
void PaintEditFrame(HWND window, HDC supplied = nullptr) {
    RECT bounds{}, client{};
    GetWindowRect(window, &bounds);
    GetClientRect(window, &client);
    POINT origin{};
    ClientToScreen(window, &origin);
    const int x = origin.x - bounds.left, y = origin.y - bounds.top;
    const HDC dc = supplied ? supplied : GetWindowDC(window);
    if (!dc) return;
    {
        Graphics graphics(dc);
        graphics.SetSmoothingMode(SmoothingModeAntiAlias);
        // Non-client painting must never overwrite the edit's caret, selection or text.
        graphics.SetClip(Rect(x, y, client.right, client.bottom), CombineModeExclude);
        SolidBrush background(ColorOf(Surface));
        graphics.FillRectangle(&background, 0, 0, bounds.right - bounds.left, bounds.bottom - bounds.top);
        Rounded(graphics, RectF(.5f, .5f, static_cast<REAL>(bounds.right - bounds.left - 1),
            static_cast<REAL>(bounds.bottom - bounds.top - 1)), static_cast<REAL>(Pixels(window, 7)), Input,
            GetFocus() == window ? RGB(139, 144, 155) : RGB(65, 67, 76), true);
    }
    if (!supplied) ReleaseDC(window, dc);
}
void InsetEdit(HWND window, RECT& bounds) {
    const HDC dc = GetDC(window);
    const auto font = reinterpret_cast<HFONT>(SendMessageW(window, WM_GETFONT, 0, 0));
    const auto previous = SelectObject(dc, font ? font : GetStockObject(DEFAULT_GUI_FONT));
    TEXTMETRICW metric{};
    GetTextMetricsW(dc, &metric);
    SelectObject(dc, previous);
    ReleaseDC(window, dc);
    const int padding = std::max(0L, (bounds.bottom - bounds.top - metric.tmHeight) / 2);
    bounds.left += Pixels(window, 12);
    bounds.right = std::max(bounds.left, bounds.right - Pixels(window, 12));
    bounds.top += padding;
    bounds.bottom -= padding;
}
LRESULT CALLBACK ControlProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam, UINT_PTR, DWORD_PTR reference) {
    const auto style = reinterpret_cast<ControlStyle*>(reference);
    if (message == WM_NCDESTROY) {
        RemoveWindowSubclass(window, ControlProc, SubclassId);
        delete style;
        return DefSubclassProc(window, message, wparam, lparam);
    }
    if (style->kind == Kind::Edit) {
        if (message == WM_NCCALCSIZE) {
            auto bounds = wparam ? &reinterpret_cast<NCCALCSIZE_PARAMS*>(lparam)->rgrc[0] : reinterpret_cast<RECT*>(lparam);
            InsetEdit(window, *bounds);
            return 0;
        }
        if (message == WM_NCPAINT) { PaintEditFrame(window); return 0; }
        if (message == WM_PRINT) {
            const auto result = DefSubclassProc(window, message, wparam, lparam);
            PaintEditFrame(window, reinterpret_cast<HDC>(wparam));
            return result;
        }
    } else {
        if (message == WM_PAINT) {
            PAINTSTRUCT paint{};
            const HDC dc = BeginPaint(window, &paint);
            PaintControl(window, dc, *style);
            EndPaint(window, &paint);
            return 0;
        }
        if (message == WM_PRINT || message == WM_PRINTCLIENT) {
            PaintControl(window, reinterpret_cast<HDC>(wparam), *style);
            return 0;
        }
        if (message == WM_ERASEBKGND || message == WM_NCPAINT) return 1;
        if (message == WM_MOUSEMOVE && !style->hover) {
            style->hover = true;
            TRACKMOUSEEVENT track{sizeof(TRACKMOUSEEVENT), TME_LEAVE, window, 0};
            TrackMouseEvent(&track);
            InvalidateRect(window, nullptr, FALSE);
        }
        if (message == WM_MOUSELEAVE) {
            style->hover = false;
            InvalidateRect(window, nullptr, FALSE);
        }
    }
    const auto result = DefSubclassProc(window, message, wparam, lparam);
    if (message == WM_SETFOCUS || message == WM_KILLFOCUS || message == WM_ENABLE || message == WM_SETTEXT ||
        message == WM_SETFONT || message == BM_SETCHECK || message == BM_SETSTATE || message == WM_UPDATEUISTATE) {
        RedrawWindow(window, nullptr, nullptr, RDW_INVALIDATE | RDW_FRAME);
    }
    return result;
}
BOOL CALLBACK RemoveStyle(HWND window, LPARAM) {
    DWORD_PTR reference = 0;
    if (GetWindowSubclass(window, ControlProc, SubclassId, &reference)) {
        RemoveWindowSubclass(window, ControlProc, SubclassId);
        delete reinterpret_cast<ControlStyle*>(reference);
    }
    return TRUE;
}
LRESULT CALLBACK WindowProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam, UINT_PTR, DWORD_PTR reference) {
    const auto style = reinterpret_cast<WindowStyle*>(reference);
    if (message == WM_NCDESTROY) {
        RemoveWindowSubclass(window, WindowProc, WindowSubclassId);
        RemovePropW(window, DesignDpiProperty);
        delete style;
        return DefSubclassProc(window, message, wparam, lparam);
    }
    if (message == WM_NCHITTEST) {
        RECT bounds{};
        GetWindowRect(window, &bounds);
        const int x = static_cast<short>(LOWORD(lparam)) - bounds.left;
        const int y = static_cast<short>(HIWORD(lparam)) - bounds.top;
        if (y >= 0 && y < MulDiv(58, style->dpi, 96) && x >= 0 && x < bounds.right - bounds.left - MulDiv(60, style->dpi, 96)) return HTCAPTION;
    }
    if (message == WM_SIZE && wparam != SIZE_MINIMIZED) {
        const int width = LOWORD(lparam), height = HIWORD(lparam);
        if (width > 0 && height > 0 && (style->width != width || style->height != height)) {
            style->width = width; style->height = height;
            const int diameter = MulDiv(32, style->dpi, 96);
            const auto region = CreateRoundRectRgn(0, 0, width + 1, height + 1, diameter, diameter);
            if (region && !SetWindowRgn(window, region, TRUE)) DeleteObject(region);
        }
    }
    return DefSubclassProc(window, message, wparam, lparam);
}
}

extern "C" int __stdcall StyleControl(HWND window, int kind) {
    if (!IsWindow(window) || kind < 1 || (kind > 5 && kind != 7) ||
        GetWindowThreadProcessId(window, nullptr) != GetCurrentThreadId() ||
        !InitOnceExecuteOnce(&graphicsOnce, StartGraphics, nullptr, nullptr)) return 0;
    DWORD_PTR existing = 0;
    if (GetWindowSubclass(window, ControlProc, SubclassId, &existing)) {
        reinterpret_cast<ControlStyle*>(existing)->kind = static_cast<Kind>(kind);
        InvalidateRect(window, nullptr, FALSE);
        return 1;
    }
    const auto style = new (std::nothrow) ControlStyle{static_cast<Kind>(kind)};
    if (!style) return 0;
    if (!SetWindowSubclass(window, ControlProc, SubclassId, reinterpret_cast<DWORD_PTR>(style))) {
        delete style;
        return 0;
    }
    SetWindowTheme(window, L"", L"");
    if (style->kind == Kind::Edit) {
        SetWindowLongPtrW(window, GWL_STYLE, GetWindowLongPtrW(window, GWL_STYLE) & ~WS_BORDER);
        SetWindowLongPtrW(window, GWL_EXSTYLE, GetWindowLongPtrW(window, GWL_EXSTYLE) & ~WS_EX_CLIENTEDGE);
        SetWindowPos(window, nullptr, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
    }
    RedrawWindow(window, nullptr, nullptr, RDW_INVALIDATE | RDW_FRAME);
    return 1;
}

extern "C" int __stdcall StyleWindow(HWND window, int designDpi) {
    if (!IsWindow(window) || designDpi <= 0 || GetWindowThreadProcessId(window, nullptr) != GetCurrentThreadId()) return 0;
    const auto style = new (std::nothrow) WindowStyle{designDpi};
    if (!style) return 0;
    if (!SetWindowSubclass(window, WindowProc, WindowSubclassId, reinterpret_cast<DWORD_PTR>(style))) { delete style; return 0; }
    SetPropW(window, DesignDpiProperty, reinterpret_cast<HANDLE>(static_cast<INT_PTR>(designDpi)));
    SetWindowLongPtrW(window, GWL_STYLE, GetWindowLongPtrW(window, GWL_STYLE) & ~(WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_MAXIMIZEBOX));
    SetWindowLongPtrW(window, GWL_EXSTYLE, GetWindowLongPtrW(window, GWL_EXSTYLE) & ~(WS_EX_DLGMODALFRAME | WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_STATICEDGE));
    SetWindowPos(window, nullptr, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
    return 1;
}

extern "C" int __stdcall ReleaseStyles(HWND parent) {
    if (!IsWindow(parent) || GetWindowThreadProcessId(parent, nullptr) != GetCurrentThreadId()) return 0;
    EnumChildWindows(parent, RemoveStyle, 0);
    DWORD_PTR reference = 0;
    if (GetWindowSubclass(parent, WindowProc, WindowSubclassId, &reference)) {
        RemoveWindowSubclass(parent, WindowProc, WindowSubclassId);
        RemovePropW(parent, DesignDpiProperty);
        delete reinterpret_cast<WindowStyle*>(reference);
    }
    if (graphicsToken) {
        GdiplusShutdown(graphicsToken);
        graphicsToken = 0;
    }
    return 1;
}
