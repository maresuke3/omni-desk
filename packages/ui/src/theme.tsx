import { useMemo, type ReactNode } from 'react'
import { CssBaseline, GlobalStyles } from '@mui/material'
import { createTheme, ThemeProvider, type Theme } from '@mui/material/styles'

export type ColorMode = 'light' | 'dark'

const FONT_SANS = [
  '-apple-system',
  'BlinkMacSystemFont',
  "'Hiragino Sans'",
  "'Hiragino Kaku Gothic ProN'",
  "'Noto Sans JP'",
  "'Segoe UI'",
  "'Yu Gothic UI'",
  'Meiryo',
  'sans-serif'
].join(', ')

export const FONT_MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

export function createAppTheme(mode: ColorMode): Theme {
  const dark = mode === 'dark'

  const bgCanvas = dark ? '#0f1115' : '#f4f5f7'
  const bgPanel = dark ? '#171a20' : '#ffffff'
  const bgSunken = dark ? '#12151a' : '#f6f7f9'
  const borderLine = dark ? '#252a33' : '#e3e6eb'
  const borderStrong = dark ? '#323844' : '#d3d8df'
  const textPrimary = dark ? '#eef0f4' : '#14171c'
  const textSecondary = dark ? '#a1a9b8' : '#4d5562'
  const textDisabled = dark ? '#697282' : '#8a92a0'
  const primaryMain = dark ? '#757cf0' : '#4f56d9'
  const primaryContrast = dark ? '#0f1115' : '#ffffff'
  const dangerMain = dark ? '#f06a6a' : '#d23b3b'
  const warningMain = dark ? '#f0a93b' : '#b86e00'
  const successMain = dark ? '#38b889' : '#13845e'

  return createTheme({
    spacing: 8,
    shape: {
      borderRadius: 8
    },
    palette: {
      mode,
      primary: {
        main: primaryMain,
        contrastText: primaryContrast
      },
      error: {
        main: dangerMain
      },
      warning: {
        main: warningMain
      },
      success: {
        main: successMain
      },
      background: {
        default: bgCanvas,
        paper: bgPanel
      },
      text: {
        primary: textPrimary,
        secondary: textSecondary,
        disabled: textDisabled
      },
      divider: borderLine,
      action: {
        hover: dark ? '#1e222a' : '#f0f2f5',
        selected: dark ? 'rgba(117, 124, 240, 0.16)' : '#eceefe'
      }
    },
    typography: {
      fontFamily: FONT_SANS,
      fontSize: 16,
      h1: { fontSize: '24px', fontWeight: 600, lineHeight: 1.33, letterSpacing: '-0.01em' },
      h2: { fontSize: '16px', fontWeight: 600, lineHeight: 1.5 },
      h3: { fontSize: '16px', fontWeight: 600, lineHeight: 1.5 },
      subtitle1: { fontSize: '16px', fontWeight: 600, lineHeight: 1.5 },
      subtitle2: { fontSize: '12px', fontWeight: 600, lineHeight: 1.33 },
      body1: { fontSize: '16px', lineHeight: 1.5 },
      body2: { fontSize: '12px', lineHeight: 1.5 },
      caption: { fontSize: '12px', lineHeight: 1.33 },
      button: { fontSize: '16px', fontWeight: 500, textTransform: 'none' }
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          'html, body, #root': {
            height: '100%'
          },
          body: {
            backgroundColor: bgCanvas,
            color: textPrimary,
            fontFamily: FONT_SANS,
            fontSize: '16px',
            lineHeight: 1.5,
            userSelect: 'none',
            cursor: 'default',
            WebkitFontSmoothing: 'antialiased'
          },
          'input, textarea, pre, code, [data-selectable]': {
            userSelect: 'text'
          }
        }
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true
        },
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: 'none',
            fontWeight: 500,
            minHeight: 32,
            paddingLeft: 16,
            paddingRight: 16,
            gap: 8
          },
          sizeSmall: {
            minHeight: 24,
            fontSize: '12px',
            paddingLeft: 8,
            paddingRight: 8,
            paddingTop: 4,
            paddingBottom: 4
          },
          sizeMedium: {
            minHeight: 32,
            fontSize: '16px',
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 4,
            paddingBottom: 4
          }
        }
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            padding: 8
          },
          sizeSmall: {
            padding: 4
          }
        }
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0
        },
        styleOverrides: {
          root: {
            backgroundImage: 'none'
          },
          outlined: {
            borderColor: borderLine
          }
        }
      },
      MuiCard: {
        defaultProps: {
          variant: 'outlined'
        },
        styleOverrides: {
          root: {
            borderRadius: 8,
            borderColor: borderLine
          }
        }
      },
      MuiTextField: {
        defaultProps: {
          size: 'small',
          variant: 'outlined'
        }
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontSize: '16px',
            backgroundColor: bgPanel,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: borderLine
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: borderStrong
            }
          },
          input: {
            '&.MuiInputBase-inputSizeSmall': {
              paddingTop: 8,
              paddingBottom: 8
            }
          }
        }
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontSize: '12px',
            height: 24
          }
        }
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            border: `1px solid ${borderLine}`
          }
        }
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontSize: '16px',
            fontWeight: 600,
            padding: '16px 24px'
          }
        }
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            padding: '16px 24px'
          }
        }
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: '16px 24px',
            gap: 8
          }
        }
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontSize: '16px',
            fontWeight: 500,
            minHeight: 40,
            paddingLeft: 16,
            paddingRight: 16
          }
        }
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontSize: '12px',
            padding: '8px 16px',
            alignItems: 'center'
          }
        }
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: '12px',
            padding: '8px 12px',
            borderRadius: 8
          }
        }
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: borderLine
          }
        }
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            flexGrow: 0,
            flexShrink: 0
          }
        }
      },
      MuiSkeleton: {
        styleOverrides: {
          root: {
            backgroundColor: bgSunken
          }
        }
      }
    }
  })
}

export function AppThemeProvider({ mode, children }: { mode: ColorMode; children: ReactNode }) {
  const theme = useMemo(() => createAppTheme(mode), [mode])
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          ':root': {
            colorScheme: mode
          },
          '.drag': {
            WebkitAppRegion: 'drag'
          },
          '.no-drag': {
            WebkitAppRegion: 'no-drag'
          },
          '::-webkit-scrollbar': {
            width: 8,
            height: 8
          },
          '::-webkit-scrollbar-track': {
            background: 'transparent'
          },
          '::-webkit-scrollbar-thumb': {
            background: mode === 'dark' ? '#323844' : '#d3d8df',
            borderRadius: 999
          },
          '::-webkit-scrollbar-thumb:hover': {
            background: mode === 'dark' ? '#697282' : '#8a92a0'
          }
        }}
      />
      {children}
    </ThemeProvider>
  )
}
